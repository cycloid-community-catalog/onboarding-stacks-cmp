import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import pg from "pg";
import {
  formatReportForLogs,
  FULL_DIAGNOSTIC_OPTIONS,
  runInstantDiagnostics,
  runNetworkDiagnostics,
  type DbTarget,
} from "./network-diagnostics.ts";

const PLUGIN_VERSION = "2.2.3";

const APP_ROLES = ["readonly", "readwrite", "admin"] as const;
type AppRole = (typeof APP_ROLES)[number];

const APP_ROLE_GROUPS: Record<AppRole, string> = {
  readonly: "cycloid_app_readonly",
  readwrite: "cycloid_app_readwrite",
  admin: "cycloid_app_admin",
};

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const DATABASE_URL =
  process.env.DATABASE_URL?.trim() || process.env.database_url?.trim() || "";
const DATABASE_SSL_SERVERNAME =
  process.env.DATABASE_SSL_SERVERNAME?.trim() ||
  process.env.database_ssl_servername?.trim() ||
  "";

const SYSTEM_USERS = new Set([
  "postgres",
  "rdsadmin",
  "rdsrepladmin",
  "rds_superuser",
  "azure_pg_admin",
  "cloudsqladmin",
  "cloudsqlsuperuser",
]);

type DbConfig = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  sslServerName?: string;
};

type PgUserRow = {
  username: string;
  appRole: string;
  roles: string;
  isSuperuser: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
};

if (!DATABASE_URL) {
  console.warn("[WARN] DATABASE_URL is not set — set database_url at plugin install time");
} else {
  try {
    const db = resolveDbConfig();
    console.log(
      `[INFO] database: configured via DATABASE_URL (${db.host}, ssl=${db.ssl}${db.sslServerName ? `, sni=${db.sslServerName}` : ""})`,
    );
  } catch {
    console.log("[INFO] database: configured via DATABASE_URL (invalid or incomplete)");
  }
}

function isIpAddress(host: string): boolean {
  if (net.isIP(host)) return true;
  return /^\[\da-f:]+\]$/i.test(host) || host.startsWith("[");
}

function wantsSsl(host: string, sslParam: string | null, sslServerName?: string): boolean {
  if (sslParam === "require" || sslParam === "verify-ca" || sslParam === "verify-full") return true;
  if (host.includes(".rds.amazonaws.com") || host.includes(".postgres.database.azure.com")) return true;
  if (sslServerName) return true;
  if (isIpAddress(host) && sslParam !== "disable") return true;
  return false;
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function quoteIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Invalid username: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteDbName(name: string): string {
  if (!name) throw new Error("Database name is required");
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function parseAppRole(value: unknown): AppRole {
  if (typeof value !== "string" || !APP_ROLES.includes(value as AppRole)) {
    throw new Error(`appRole must be one of: ${APP_ROLES.join(", ")}`);
  }
  return value as AppRole;
}

function validateNewUsername(username: string): string {
  const trimmed = username.trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(trimmed)) {
    throw new Error("Username must start with a letter and contain only letters, digits, and underscores");
  }
  return trimmed;
}

function validatePassword(password: string): string {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return password;
}

async function ensureAppGroupRole(client: pg.Client, appRole: AppRole, database: string): Promise<string> {
  const groupRole = APP_ROLE_GROUPS[appRole];
  const exists = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
    [groupRole],
  );
  if (exists.rows[0]?.exists) return groupRole;

  await client.query(`CREATE ROLE ${quoteIdent(groupRole)} NOLOGIN`);
  await client.query(`GRANT CONNECT ON DATABASE ${quoteDbName(database)} TO ${quoteIdent(groupRole)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdent(groupRole)}`);

  if (appRole === "readonly") {
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdent(groupRole)}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdent(groupRole)}`,
    );
  } else if (appRole === "readwrite") {
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdent(groupRole)}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdent(groupRole)}`,
    );
  } else {
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${quoteIdent(groupRole)}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${quoteIdent(groupRole)}`,
    );
  }

  return groupRole;
}

async function createPostgresUser(
  client: pg.Client,
  masterUser: string,
  database: string,
  username: string,
  password: string,
  appRole: AppRole,
): Promise<void> {
  const name = validateNewUsername(username);
  if (isProtectedUser(name, masterUser)) {
    throw new Error(`Cannot create protected username: ${name}`);
  }

  const taken = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
    [name],
  );
  if (taken.rows[0]?.exists) {
    throw new Error(`User already exists: ${name}`);
  }

  const groupRole = await ensureAppGroupRole(client, appRole, database);
  await client.query(
    `CREATE ROLE ${quoteIdent(name)} WITH LOGIN PASSWORD ${quoteLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`,
  );
  await client.query(`GRANT ${quoteIdent(groupRole)} TO ${quoteIdent(name)}`);
}

async function deletePostgresUser(client: pg.Client, masterUser: string, username: string): Promise<void> {
  const name = validateNewUsername(username);
  if (isProtectedUser(name, masterUser)) {
    throw new Error(`Cannot delete protected user: ${name}`);
  }

  const exists = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
    [name],
  );
  if (!exists.rows[0]?.exists) {
    throw new Error(`User not found: ${name}`);
  }

  await client.query(`DROP ROLE ${quoteIdent(name)}`);
}

function parseRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host?.trim() || "localhost";
  const base = host.includes("://") ? host : `http://${host}`;
  try {
    return new URL(req.url ?? "/", base);
  } catch {
    return new URL("/", base);
  }
}

function normalizeSlashes(pathname: string): string {
  const collapsed = pathname.replace(/\/+/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) return collapsed.slice(0, -1);
  return collapsed || "/";
}

function normalizePluginPath(pathname: string): string {
  const path = normalizeSlashes(pathname || "/");
  const iframeIdx = path.indexOf("/iframe");
  if (iframeIdx >= 0) {
    const rest = path.slice(iframeIdx + "/iframe".length);
    if (!rest || rest === "/") return "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  const widgetMatch = /\/plugin_widgets\/\d+\/[^/]+/.exec(path);
  if (widgetMatch) {
    const rest = path.slice(widgetMatch.index + widgetMatch[0].length);
    if (!rest || rest === "/") return "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return path;
}

function resolvePathname(url: URL, rawPathname: string): string {
  const proxyPath = url.searchParams.get("path")?.trim();
  if (proxyPath) {
    const normalized = proxyPath.startsWith("/") ? proxyPath : `/${proxyPath}`;
    return normalizePluginPath(normalized);
  }
  return normalizePluginPath(rawPathname);
}

function send(
  res: ServerResponse,
  status: number,
  body: string | object,
  contentType = "application/json",
): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": contentType });
  res.end(payload);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function unwrapConfigValue(value: string): string {
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function sslModeFromUrl(value: string): string | null {
  if (/[?&]sslmode=disable\b/i.test(value)) return "disable";
  if (/[?&]sslmode=(require|verify-ca|verify-full)\b/i.test(value)) return "require";
  return null;
}

function parseDatabaseUrl(value: string): DbConfig | null {
  const trimmed = unwrapConfigValue(value);
  if (!trimmed) return null;

  const normalized = trimmed.replace(/^postgres:\/\//, "postgresql://");
  const sslParam = sslModeFromUrl(normalized);

  const standard =
    /^postgres(?:ql)?:\/\/([^:/?#]+):([^@/?#]*)@(\[[^\]]+\]|[^:/?#@]+)(?::(\d+))?\/([^?#]*)/.exec(
      normalized,
    );
  if (standard) {
    const hostRaw = standard[3]!;
    const host = hostRaw.startsWith("[") ? hostRaw.slice(1, -1) : hostRaw;
    const username = decodeURIComponent(standard[1]!);
    const password = decodeURIComponent(standard[2]!);
    const database = decodeURIComponent(standard[5]! || "postgres") || "postgres";
    if (!username || !host) return null;
    return {
      host,
      port: standard[4] || "5432",
      username,
      password,
      database,
      ssl: wantsSsl(host, sslParam),
    };
  }

  const azure =
    /^postgres(?:ql)?:\/\/([^@/]+)@([^:/?#]+):([^@/?#]*)@(\[[^\]]+\]|[^:/?#@]+)(?::(\d+))?\/([^?#]*)/.exec(
      normalized,
    );
  if (azure) {
    const hostRaw = azure[4]!;
    const host = hostRaw.startsWith("[") ? hostRaw.slice(1, -1) : hostRaw;
    const username = decodeURIComponent(azure[1]!);
    const password = decodeURIComponent(azure[3]!);
    const database = decodeURIComponent(azure[6]! || "postgres") || "postgres";
    if (!username || !host) return null;
    return {
      host,
      port: azure[5] || "5432",
      username,
      password,
      database,
      ssl: wantsSsl(host, sslParam),
    };
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname;
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (!host || !username) return null;

    return {
      host,
      port: url.port || "5432",
      username,
      password,
      database: decodeURIComponent(url.pathname.replace(/^\//, "") || "postgres"),
      ssl: wantsSsl(host, url.searchParams.get("sslmode") ?? sslParam),
    };
  } catch {
    return null;
  }
}

function resolveDbConfig(): DbConfig {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured. Set database_url at plugin install time (postgresql://user:password@host:5432/database).",
    );
  }
  const db = parseDatabaseUrl(DATABASE_URL);
  if (!db) {
    const hint = DATABASE_URL.includes("@")
      ? ""
      : " The value looks truncated (missing @host) — use single quotes when passing database_url on the CLI.";
    throw new Error(
      "Invalid database_url. Expected postgresql://user:password@host:5432/database" + hint,
    );
  }
  if (DATABASE_SSL_SERVERNAME) {
    db.ssl = true;
    db.sslServerName = DATABASE_SSL_SERVERNAME;
  }
  if (isIpAddress(db.host) && db.ssl && !db.sslServerName) {
    throw new Error(
      "database_ssl_servername is required when database_url uses an IP address. " +
        "Set it to the Azure/RDS hostname (e.g. demopostgres99.postgres.database.azure.com).",
    );
  }
  return db;
}

const DB_CONNECT_TIMEOUT_MS = 15_000;

function buildPgSslOptions(db: DbConfig): pg.ConnectionConfig["ssl"] {
  if (!db.ssl) return false;
  const servername = db.sslServerName || (isIpAddress(db.host) ? undefined : db.host);
  return {
    rejectUnauthorized: false,
    ...(servername ? { servername } : {}),
    checkServerIdentity: () => undefined,
  };
}

function buildPgClientConfig(db: DbConfig): pg.ClientConfig {
  return {
    host: db.host,
    port: Number(db.port),
    user: db.username,
    password: db.password,
    database: db.database,
    ssl: buildPgSslOptions(db),
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    query_timeout: DB_CONNECT_TIMEOUT_MS,
  };
}

function formatPgConnectError(db: DbConfig, err: unknown): Error {
  const message = (err as Error).message ?? String(err);
  if (/timeout/i.test(message)) {
    return new Error(
      `Cannot reach PostgreSQL at ${db.host}:${db.port} (${message}). ` +
        "Ensure public network access is enabled and the plugin container can reach the database.",
    );
  }
  if (/no encryption|pg_hba|ssl|altnames|certificate/i.test(message)) {
    return new Error(
      `PostgreSQL rejected the connection (${message}). ` +
        (isIpAddress(db.host)
          ? "When using an IP (DNS workaround), set database_ssl_servername to the Azure FQDN (e.g. demopostgres99.postgres.database.azure.com)."
          : "Azure requires SSL — ensure database_url uses the Azure hostname or set database_ssl_servername."),
    );
  }
  return err instanceof Error ? err : new Error(message);
}

function resolveDbTarget(): DbTarget | null {
  try {
    const db = resolveDbConfig();
    return {
      host: db.host,
      port: db.port,
      username: db.username,
      database: db.database,
      ssl: db.ssl,
    };
  } catch {
    return null;
  }
}

async function testPostgresConnection(db: DbConfig): Promise<Record<string, unknown>> {
  const client = new pg.Client(buildPgClientConfig(db));
  const started = Date.now();
  await client.connect();
  const connectMs = Date.now() - started;
  const result = await client.query<{ version: string; current_user: string; current_database: string }>(
    "SELECT version(), current_user, current_database()",
  );
  await client.end().catch(() => undefined);
  return {
    host: db.host,
    port: db.port,
    connectMs,
    version: result.rows[0]?.version,
    currentUser: result.rows[0]?.current_user,
    currentDatabase: result.rows[0]?.current_database,
  };
}

function instantDiagnosticsTarget(): Record<string, unknown> | null {
  const db = resolveDbTarget();
  if (!db) return null;
  return {
    host: db.host,
    port: db.port,
    username: db.username,
    database: db.database,
    ssl: db.ssl,
    password: "[redacted]",
  };
}

function buildInstantDiagnosticsReport() {
  return runInstantDiagnostics(PLUGIN_VERSION, instantDiagnosticsTarget());
}

let backgroundDiagnosticsRunning = false;

function scheduleBackgroundNetworkDiagnostics(): void {
  if (backgroundDiagnosticsRunning) return;
  backgroundDiagnosticsRunning = true;
  void (async () => {
    try {
      let dbConfig: DbConfig | null = null;
      try {
        dbConfig = resolveDbConfig();
      } catch {
        dbConfig = null;
      }
      const target = resolveDbTarget();
      const report = await runNetworkDiagnostics(
        PLUGIN_VERSION,
        target,
        dbConfig ? () => testPostgresConnection(dbConfig!) : undefined,
        FULL_DIAGNOSTIC_OPTIONS,
      );
      console.log(formatReportForLogs(report));
    } catch (err) {
      console.error("[NETWORK-DIAG] background report failed:", (err as Error).message);
    } finally {
      backgroundDiagnosticsRunning = false;
    }
  })();
}

async function withPgClient<T>(db: DbConfig, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(buildPgClientConfig(db));
  try {
    await client.connect();
    return await fn(client);
  } catch (err) {
    throw formatPgConnectError(db, err);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function normalizeRoleNames(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((part) => part.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean);
  }
  return [trimmed];
}

function appRoleLabel(roleNames: unknown): string {
  const roles = normalizeRoleNames(roleNames);
  if (roles.includes("cycloid_app_readonly")) return "readonly";
  if (roles.includes("cycloid_app_readwrite")) return "readwrite";
  if (roles.includes("cycloid_app_admin")) return "admin";
  if (roles.length === 0) return "custom";
  return roles.join(", ");
}

function isProtectedUser(username: string, masterUser: string): boolean {
  if (username === masterUser) return true;
  if (SYSTEM_USERS.has(username)) return true;
  if (username.startsWith("pg_")) return true;
  if (username.startsWith("rds")) return true;
  return false;
}

async function listPostgresUsers(client: pg.Client, masterUser: string): Promise<PgUserRow[]> {
  const result = await client.query<{
    username: string;
    is_superuser: boolean;
    can_create_db: boolean;
    can_create_role: boolean;
    member_roles: string[] | string | null;
  }>(`
    SELECT
      u.rolname AS username,
      u.rolsuper AS is_superuser,
      u.rolcreatedb AS can_create_db,
      u.rolcreaterole AS can_create_role,
      array_remove(array_agg(DISTINCT mr.rolname), NULL) AS member_roles
    FROM pg_roles u
    LEFT JOIN pg_auth_members m ON m.member = u.oid
    LEFT JOIN pg_roles mr ON mr.oid = m.roleid
    WHERE u.rolcanlogin
    GROUP BY u.rolname, u.rolsuper, u.rolcreatedb, u.rolcreaterole
    ORDER BY u.rolname
  `);

  return result.rows
    .filter((row) => !isProtectedUser(row.username, masterUser))
    .map((row) => {
      const memberRoles = normalizeRoleNames(row.member_roles);
      return {
        username: row.username,
        appRole: appRoleLabel(memberRoles),
        roles: memberRoles.length ? memberRoles.join(", ") : "(none)",
        isSuperuser: row.is_superuser,
        canCreateDb: row.can_create_db,
        canCreateRole: row.can_create_role,
      };
    });
}

async function fetchUsers(): Promise<{ users: PgUserRow[]; syncedAt: string }> {
  const db = resolveDbConfig();
  const users = await withPgClient(db, (client) => listPostgresUsers(client, db.username));
  const syncedAt = new Date().toISOString();
  console.log(`[INFO] listed ${users.length} users from ${db.host}:${db.port}/${db.database}`);
  return { users, syncedAt };
}

function boolCell(value: boolean): string {
  return value ? "yes" : "no";
}

function renderUserRows(users: PgUserRow[], syncedAt: string): string {
  if (users.length === 0) {
    return `<tr><td colspan="8" class="muted">No application users found.</td></tr>`;
  }
  return users
    .map(
      (user) => `
      <tr>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.appRole)}</td>
        <td>${escapeHtml(user.roles)}</td>
        <td>${boolCell(user.isSuperuser)}</td>
        <td>${boolCell(user.canCreateDb)}</td>
        <td>${boolCell(user.canCreateRole)}</td>
        <td>${escapeHtml(syncedAt)}</td>
      </tr>`,
    )
    .join("");
}

function renderUsersPage(users: PgUserRow[], syncedAt: string, error = ""): string {
  const rows = renderUserRows(users, syncedAt);
  const errorBlock = error
    ? `<div id="alert" class="alert">${escapeHtml(error)}</div>`
    : `<div id="alert" class="alert" hidden></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PostgreSQL users</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #f4f6fa; color: #1a2233; }
    main { padding: 1rem 1.25rem 1.5rem; }
    h1 { font-size: 1.1rem; margin: 0 0 0.25rem; }
    .muted { color: #5c677f; font-size: 0.875rem; margin-bottom: 1rem; }
    .alert { background: #ffebee; color: #b71c1c; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; }
    .alert[hidden] { display: none; }
    .card { background: #fff; border: 1px solid #d8deea; border-radius: 10px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { border-bottom: 1px solid #e7ebf3; padding: 0.65rem 0.75rem; text-align: left; white-space: nowrap; }
    th { background: #f8f9fc; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #5c677f; position: sticky; top: 0; }
    tr:last-child td { border-bottom: 0; }
    .diag { margin-top: 1rem; background: #fff; border: 1px solid #d8deea; border-radius: 10px; padding: 0.75rem 1rem; }
    .diag summary { cursor: pointer; font-size: 0.875rem; font-weight: 600; }
    .diag pre { margin: 0.75rem 0 0; padding: 0.75rem; background: #0f172a; color: #e2e8f0; border-radius: 8px; overflow: auto; font-size: 0.75rem; line-height: 1.4; max-height: 420px; white-space: pre-wrap; word-break: break-word; }
    .diag-actions { margin-top: 0.5rem; display: flex; gap: 0.5rem; }
    .diag-actions button { font: inherit; font-size: 0.8125rem; padding: 0.35rem 0.65rem; border-radius: 6px; border: 1px solid #c5cee0; background: #fff; cursor: pointer; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: end; margin-bottom: 1rem; padding: 0.875rem 1rem; background: #fff; border: 1px solid #d8deea; border-radius: 10px; }
    .toolbar label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.75rem; color: #5c677f; }
    .toolbar input, .toolbar select { font: inherit; font-size: 0.875rem; padding: 0.4rem 0.55rem; border: 1px solid #c5cee0; border-radius: 6px; min-width: 10rem; }
    .btn { font: inherit; font-size: 0.875rem; padding: 0.45rem 0.85rem; border-radius: 6px; border: 1px solid #c5cee0; background: #fff; cursor: pointer; }
    .btn-primary { background: #1a6fb5; border-color: #1a6fb5; color: #fff; }
    .btn-danger { color: #b71c1c; border-color: #ef9a9a; padding: 0.25rem 0.45rem; line-height: 1; }
    .actions { width: 3rem; text-align: center; }
  </style>
</head>
<body>
  <main>
    <h1>PostgreSQL users</h1>
    <p class="muted">Read-only list of application login roles</p>
    ${errorBlock}
    <form id="add-user-form" class="toolbar">
      <label>Username<input name="username" required pattern="[a-z][a-z0-9_]*" autocomplete="off" /></label>
      <label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password" /></label>
      <label>Application role
        <select name="appRole">
          <option value="readonly">readonly</option>
          <option value="readwrite" selected>readwrite</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <button type="submit" class="btn btn-primary">Add user</button>
    </form>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Application role</th>
            <th>PostgreSQL roles</th>
            <th>Superuser</th>
            <th>Can create DB</th>
            <th>Can create role</th>
            <th>Last synced</th>
            <th class="actions"></th>
          </tr>
        </thead>
        <tbody id="users-body">${rows}</tbody>
      </table>
    </div>
    <details id="diag-panel" class="diag" hidden>
      <summary>Network diagnostics (for Cycloid support)</summary>
      <div class="diag-actions">
        <button type="button" id="diag-copy">Copy JSON</button>
        <button type="button" id="diag-refresh">Re-run diagnostics</button>
      </div>
      <pre id="diag-output"></pre>
    </details>
  </main>
</body>
</html>`;
}

function renderUsersShell(instantReport: ReturnType<typeof buildInstantDiagnosticsReport>): string {
  const embeddedDiagnostics = JSON.stringify(instantReport).replace(/<\//g, "<\\/");
  const page = renderUsersPage([], "", "").replace(
    `<tbody id="users-body"><tr><td colspan="8" class="muted">No application users found.</td></tr></tbody>`,
    `<tbody id="users-body"><tr><td colspan="8" class="muted">Loading users…</td></tr></tbody>`,
  );

  const script = `
<script>
(async () => {
  const alertEl = document.getElementById("alert");
  const bodyEl = document.getElementById("users-body");
  const diagPanel = document.getElementById("diag-panel");
  const diagOutput = document.getElementById("diag-output");
  const diagCopy = document.getElementById("diag-copy");
  const diagRefresh = document.getElementById("diag-refresh");
  let lastDiagnostics = null;

  const embeddedDiagnostics = ${embeddedDiagnostics};

  function showDiagnostics(report) {
    if (!diagPanel || !diagOutput) return;
    diagPanel.hidden = false;
    lastDiagnostics = report;
    diagOutput.textContent = JSON.stringify(report, null, 2);
  }

  async function pluginApiUrl(path) {
    const url = new URL(window.location.href);
    url.searchParams.set("path", path);
    return url.href;
  }

  async function runDiagnostics() {
    showDiagnostics(embeddedDiagnostics);
    const apiUrl = await pluginApiUrl("/api/network-diagnostics");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(apiUrl, { headers: { accept: "application/json" }, signal: controller.signal });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
      showDiagnostics(data);
    } catch (err) {
      const msg = err.name === "AbortError"
        ? "Diagnostics API timed out after 8s (Cycloid proxy). Instant snapshot is shown above; network tests are in plugin logs."
        : (err.message || String(err));
      showDiagnostics({ ...embeddedDiagnostics, fetchError: msg });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (diagCopy) {
    diagCopy.addEventListener("click", async () => {
      const text = diagOutput ? diagOutput.textContent || "" : "";
      try { await navigator.clipboard.writeText(text); diagCopy.textContent = "Copied"; }
      catch { diagCopy.textContent = "Copy failed"; }
      setTimeout(() => { diagCopy.textContent = "Copy JSON"; }, 1500);
    });
  }
  if (diagRefresh) diagRefresh.addEventListener("click", () => { runDiagnostics(); });

  const apiUrl = await pluginApiUrl("/api/users");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(apiUrl, { headers: { accept: "application/json" }, signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { throw new Error(text.slice(0, 240) || ("HTTP " + res.status)); }
    if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
    if (alertEl) alertEl.hidden = true;
    const users = data.users || [];
    const syncedAt = data.syncedAt || "";
    if (users.length === 0) {
      bodyEl.innerHTML = '<tr><td colspan="8" class="muted">No application users found.</td></tr>';
      return;
    }
    bodyEl.innerHTML = users.map((user) => \`
      <tr>
        <td>\${user.username}</td>
        <td>\${user.appRole}</td>
        <td>\${user.roles}</td>
        <td>\${user.isSuperuser ? "yes" : "no"}</td>
        <td>\${user.canCreateDb ? "yes" : "no"}</td>
        <td>\${user.canCreateRole ? "yes" : "no"}</td>
        <td>\${syncedAt}</td>
      </tr>\`).join("");
    bodyEl.querySelectorAll("tr").forEach((row, i) => {
      const td = document.createElement("td");
      td.className = "actions";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-danger delete-user";
      btn.title = "Delete user";
      btn.dataset.username = users[i].username;
      btn.textContent = "\u00d7";
      td.appendChild(btn);
      row.appendChild(td);
    });
  } catch (err) {
    const msg = err.name === "AbortError"
      ? "Request timed out after 20s. Check database_url and network access to PostgreSQL."
      : (err.message || String(err));
    if (alertEl) { alertEl.hidden = false; alertEl.textContent = msg; }
    bodyEl.innerHTML = '<tr><td colspan="8" class="muted">Failed to load users.</td></tr>';
    showDiagnostics(embeddedDiagnostics);
  } finally {
    clearTimeout(timeout);
  }

  const addForm = document.getElementById("add-user-form");
  if (addForm) {
    addForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const apiUrl = await pluginApiUrl("/api/users");
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            username: form.username.value.trim(),
            password: form.password.value,
            appRole: form.appRole.value,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
        location.reload();
      } catch (err) {
        if (alertEl) { alertEl.hidden = false; alertEl.textContent = err.message || String(err); }
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (bodyEl) {
    bodyEl.addEventListener("click", async (event) => {
      const btn = event.target.closest(".delete-user");
      if (!btn) return;
      const username = btn.dataset.username;
      if (!username || !confirm("Delete PostgreSQL user \"" + username + "\"?")) return;
      btn.disabled = true;
      try {
        const apiUrl = await pluginApiUrl("/api/users/" + encodeURIComponent(username));
        const res = await fetch(apiUrl, { method: "DELETE", headers: { accept: "application/json" } });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
        location.reload();
      } catch (err) {
        if (alertEl) { alertEl.hidden = false; alertEl.textContent = err.message || String(err); }
        btn.disabled = false;
      }
    });
  }
})();
</script>`;

  return page.replace("</body>", `${script}</body>`);
}

async function handleNetworkDiagnostics(res: ServerResponse): Promise<void> {
  scheduleBackgroundNetworkDiagnostics();
  const report = buildInstantDiagnosticsReport();
  console.log(formatReportForLogs(report));
  send(res, 200, report);
}

async function handleCreateUser(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const username = validateNewUsername(String(body.username ?? ""));
    const password = validatePassword(String(body.password ?? ""));
    const appRole = parseAppRole(body.appRole);
    const db = resolveDbConfig();
    await withPgClient(db, (client) => createPostgresUser(client, db.username, db.database, username, password, appRole));
    console.log(`[INFO] created user ${username} (${appRole})`);
    const { users, syncedAt } = await fetchUsers();
    send(res, 201, { ok: true, username, appRole, users, syncedAt });
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
}

async function handleDeleteUser(res: ServerResponse, username: string): Promise<void> {
  try {
    const db = resolveDbConfig();
    await withPgClient(db, (client) => deletePostgresUser(client, db.username, username));
    console.log(`[INFO] deleted user ${username}`);
    const { users, syncedAt } = await fetchUsers();
    send(res, 200, { ok: true, username, users, syncedAt });
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
}

async function handleUsersApi(res: ServerResponse): Promise<void> {
  try {
    const { users, syncedAt } = await fetchUsers();
    send(res, 200, { users, syncedAt });
  } catch (err) {
    send(res, 500, { error: (err as Error).message });
  }
}

async function handleResync(res: ServerResponse): Promise<void> {
  try {
    const { users } = await fetchUsers();
    send(res, 200, { started: true, users: users.length });
  } catch (err) {
    send(res, 500, { started: false, error: (err as Error).message });
  }
}

const server = createServer((req, res) => {
  const start = Date.now();
  const method = req.method ?? "GET";
  const url = parseRequestUrl(req);
  const pathname = resolvePathname(url, url.pathname);

  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${method} ${pathname} → ${res.statusCode} (${ms}ms) req=${req.url ?? "-"}`);
  });

  if (method === "GET" && pathname === "/_cy/ping") return send(res, 200, { ok: true });
  if (method === "POST" && pathname === "/_cy/events") return send(res, 200, { ok: true });
  if (method === "DELETE" && pathname === "/_cy/plugin") return send(res, 200, { ok: true });

  if (method === "POST" && pathname === "/_cy/resync") {
    handleResync(res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  if (method === "GET" && (pathname === "/" || pathname === "/index.html" || pathname === "/ui/users")) {
    scheduleBackgroundNetworkDiagnostics();
    send(res, 200, renderUsersShell(buildInstantDiagnosticsReport()), "text/html; charset=utf-8");
    return;
  }

  if (method === "GET" && pathname === "/api/users") {
    handleUsersApi(res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  if (method === "POST" && pathname === "/api/users") {
    handleCreateUser(req, res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  const deleteUserMatch = /^\/api\/users\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && deleteUserMatch) {
    handleDeleteUser(res, decodeURIComponent(deleteUserMatch[1]!)).catch((err) =>
      send(res, 500, { error: (err as Error).message }),
    );
    return;
  }

  if (
    method === "GET" &&
    (pathname === "/api/network-diagnostics" || pathname === "/_cy/network-diagnostics")
  ) {
    handleNetworkDiagnostics(res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  send(res, 404, { error: "Not Found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port} (plugin v${PLUGIN_VERSION})`);
});
