import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const DB_PORT = process.env.DB_PORT?.trim() || "5432";
const DB_FILE = process.env.DB_FILE?.trim() || ":memory:";
const PROXY_URL = process.env.PROXY_URL?.trim().replace(/\/$/, "") ?? "";
const PLUGIN_SECRET = process.env.PLUGIN_SECRET?.trim() ?? "";
const CY_API_URL = process.env.CY_API_URL?.trim().replace(/\/$/, "") ?? "";
const CY_API_KEY = process.env.CY_API_KEY?.trim() ?? "";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(PLUGIN_DIR, "schema.sql"), "utf8");

const APP_ROLES = {
  readonly: "cycloid_app_readonly",
  readwrite: "cycloid_app_readwrite",
  admin: "cycloid_app_admin",
} as const;

type AppRole = keyof typeof APP_ROLES;

const SYSTEM_USERS = new Set([
  "postgres",
  "rdsadmin",
  "rdsrepladmin",
  "rds_superuser",
  "azure_pg_admin",
  "cloudsqladmin",
  "cloudsqlsuperuser",
]);

type ComponentCtx = {
  org: string;
  project: string;
  env: string;
  component: string;
};

type InventoryOutput = {
  key?: string;
  value?: unknown;
  project_canonical?: string;
  environment_canonical?: string;
  component_canonical?: string;
};

type DbConfig = {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
};

type PgUserRow = {
  username: string;
  appRole: string;
  roles: string;
  isSuperuser: boolean;
  canCreateDb: boolean;
  canCreateRole: boolean;
};

const sqlite = new DatabaseSync(DB_FILE);
sqlite.exec("PRAGMA foreign_keys = ON");
sqlite.exec(SCHEMA_SQL);

console.log(`[INFO] sqlite db: ${DB_FILE}`);
console.log(
  `[INFO] cycloid api: ${
    PROXY_URL
      ? `proxy (${PROXY_URL})`
      : CY_API_URL && CY_API_KEY
        ? `direct (${CY_API_URL})`
        : "not configured"
  }`,
);

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

function normalizePluginPath(pathname: string): string {
  const iframeIdx = pathname.indexOf("/iframe");
  if (iframeIdx >= 0) {
    const rest = pathname.slice(iframeIdx + "/iframe".length);
    if (!rest || rest === "/") return "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return pathname || "/";
}

const COMPONENT_PATH =
  /\/organizations\/([^/]+)\/projects\/([^/]+)\/environments\/([^/]+)\/components\/([^/]+)/;

function parseComponentCtxFromPath(pathname: string): ComponentCtx | null {
  const match = COMPONENT_PATH.exec(pathname);
  if (!match) return null;
  return {
    org: decodeURIComponent(match[1]),
    project: decodeURIComponent(match[2]),
    env: decodeURIComponent(match[3]),
    component: decodeURIComponent(match[4]),
  };
}

function parseComponentCtxFromSearch(url: URL): ComponentCtx | null {
  const org = url.searchParams.get("org")?.trim() ?? "";
  const project = url.searchParams.get("project")?.trim() ?? "";
  const env = url.searchParams.get("env")?.trim() ?? "";
  const component = url.searchParams.get("component")?.trim() ?? "";
  if (!org || !project || !env || !component) return null;
  return { org, project, env, component };
}

function parseComponentCtx(url: URL, req: IncomingMessage, rawPathname: string): ComponentCtx | null {
  const fromQuery = parseComponentCtxFromSearch(url);
  if (fromQuery) return fromQuery;

  const fromPath = parseComponentCtxFromPath(rawPathname);
  if (fromPath) return fromPath;

  const referer = req.headers.referer ?? req.headers.referrer;
  if (typeof referer === "string" && referer) {
    try {
      const ref = new URL(referer);
      const fromRefQuery = parseComponentCtxFromSearch(ref);
      if (fromRefQuery) return fromRefQuery;
      const fromRefPath = parseComponentCtxFromPath(ref.pathname);
      if (fromRefPath) return fromRefPath;
    } catch {
      /* ignore malformed referer */
    }
  }

  return null;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function unwrapOutputValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
      return trimmed.slice(1, -1);
    }
    return raw;
  }
  return raw;
}

function parsePostgresConnectionString(value: string): Partial<DbConfig> | null {
  try {
    const normalized = value.replace(/^postgres:\/\//, "postgresql://");
    const url = new URL(normalized);
    return {
      host: url.hostname,
      port: url.port || DB_PORT,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, "") || "postgres",
    };
  } catch {
    const legacy =
      /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/.exec(value);
    if (!legacy) return null;
    return {
      username: decodeURIComponent(legacy[1]),
      password: decodeURIComponent(legacy[2]),
      host: legacy[3],
      port: legacy[4] || DB_PORT,
      database: legacy[5] || "postgres",
    };
  }
}

function firstString(outputs: Map<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = unwrapOutputValue(outputs.get(key));
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function resolveDbConfig(outputs: Map<string, unknown>): DbConfig | null {
  const connectionString = firstString(outputs, ["connection_string"]);
  if (connectionString) {
    const parsed = parsePostgresConnectionString(connectionString);
    if (parsed?.host && parsed.username && parsed.password) {
      return {
        host: parsed.host,
        port: parsed.port || DB_PORT,
        username: parsed.username,
        password: parsed.password,
        database: parsed.database || "postgres",
        ssl:
          parsed.host.includes(".rds.amazonaws.com") ||
          parsed.host.includes(".postgres.database.azure.com"),
      };
    }
  }

  const host = firstString(outputs, [
    "rds_address",
    "postgresql_server_fqdn",
    "public_ip_address",
    "private_ip_address",
  ]);
  const username = firstString(outputs, ["rds_username", "database_user", "administrator_login"]);
  const password = firstString(outputs, ["rds_password", "database_password"]);
  const database = firstString(outputs, ["database_name"]) || "postgres";

  if (!host || !username || !password) return null;

  let resolvedHost = host;
  let resolvedPort = DB_PORT;
  if (host.includes(":")) {
    const [h, p] = host.split(":");
    resolvedHost = h;
    if (p) resolvedPort = p;
  }

  return {
    host: resolvedHost,
    port: resolvedPort,
    username,
    password,
    database,
    ssl:
      resolvedHost.includes(".rds.amazonaws.com") ||
      resolvedHost.includes(".postgres.database.azure.com"),
  };
}

function cycloidApiError(): string {
  return [
    "Cannot reach the Cycloid API to read Terraform outputs.",
    "Configure PROXY_URL (Plugin Manager) or cy_api_url + cy_api_key at install time.",
  ].join("\n");
}

function httpGet(
  target: URL,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const isHttps = target.protocol === "https:";
    const request = isHttps ? httpsRequest : httpRequest;
    const req = request(
      {
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { accept: "application/json", ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function cycloidGet(path: string): Promise<{ status: number; body: string }> {
  if (PROXY_URL) {
    const url = new URL(path, PROXY_URL);
    if (PLUGIN_SECRET) {
      url.searchParams.set("secret", PLUGIN_SECRET);
    }
    return httpGet(url, {});
  }

  if (CY_API_URL && CY_API_KEY) {
    const url = new URL(path, CY_API_URL);
    return httpGet(url, { authorization: `Bearer ${CY_API_KEY}` });
  }

  throw new Error(cycloidApiError());
}

function matchesComponent(output: InventoryOutput, ctx: ComponentCtx): boolean {
  const project = output.project_canonical?.trim();
  const env = output.environment_canonical?.trim();
  const component = output.component_canonical?.trim();
  if (project && project !== ctx.project) return false;
  if (env && env !== ctx.env) return false;
  if (component && component !== ctx.component) return false;
  return Boolean(output.key);
}

async function fetchComponentOutputs(ctx: ComponentCtx): Promise<Map<string, unknown>> {
  const filter = [
    `project_canonical[eq]=${ctx.project}`,
    `environment_canonical[eq]=${ctx.env}`,
    `component_canonical[eq]=${ctx.component}`,
  ].join("&");

  const path = `/organizations/${encodeURIComponent(ctx.org)}/inventory/outputs?filters=${encodeURIComponent(filter)}&page_size=200`;
  const res = await cycloidGet(path);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`inventory outputs HTTP ${res.status}: ${res.body.slice(0, 240)}`);
  }

  const parsed = JSON.parse(res.body) as { data?: InventoryOutput[] };
  const map = new Map<string, unknown>();
  for (const item of parsed.data ?? []) {
    if (!item.key || !matchesComponent(item, ctx)) continue;
    map.set(item.key, unwrapOutputValue(item.value));
  }
  return map;
}

async function resolveDbForComponent(ctx: ComponentCtx): Promise<DbConfig> {
  const outputs = await fetchComponentOutputs(ctx);
  const db = resolveDbConfig(outputs);
  if (!db) {
    const keys = [...outputs.keys()].sort().join(", ") || "(none)";
    throw new Error(
      `No PostgreSQL inventory outputs for this component. Found keys: ${keys}. Expected rds_address/rds_username/rds_password or connection_string.`,
    );
  }
  return db;
}

async function withPgClient<T>(db: DbConfig, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    host: db.host,
    port: Number(db.port),
    user: db.username,
    password: db.password,
    database: db.database,
    ssl: db.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function appRoleFromPgRoles(roleNames: string[]): string {
  for (const [label, pgRole] of Object.entries(APP_ROLES)) {
    if (roleNames.includes(pgRole)) return label;
  }
  if (roleNames.length === 0) return "custom";
  return roleNames.join(", ");
}

function isProtectedUser(username: string, masterUser: string): boolean {
  if (username === masterUser) return true;
  if (SYSTEM_USERS.has(username)) return true;
  if (username.startsWith("pg_")) return true;
  if (username.startsWith("rds")) return true;
  return false;
}

async function ensureAppRoles(client: pg.Client, database: string): Promise<void> {
  const dbIdent = quoteIdent(database);
  await client.query(`
    DO $$ BEGIN CREATE ROLE ${quoteIdent(APP_ROLES.readonly)} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE ${quoteIdent(APP_ROLES.readwrite)} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE ${quoteIdent(APP_ROLES.admin)} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);

  await client.query(`GRANT CONNECT ON DATABASE ${dbIdent} TO ${quoteIdent(APP_ROLES.readonly)}`);
  await client.query(`GRANT CONNECT ON DATABASE ${dbIdent} TO ${quoteIdent(APP_ROLES.readwrite)}`);
  await client.query(`GRANT CONNECT ON DATABASE ${dbIdent} TO ${quoteIdent(APP_ROLES.admin)}`);

  for (const role of Object.values(APP_ROLES)) {
    const roleIdent = quoteIdent(role);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${roleIdent}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${roleIdent}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${roleIdent}`,
    );
  }

  const rw = quoteIdent(APP_ROLES.readwrite);
  await client.query(`GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${rw}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE, DELETE ON TABLES TO ${rw}`,
  );

  const admin = quoteIdent(APP_ROLES.admin);
  await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${admin}`);
  await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${admin}`);
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${admin}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${admin}`,
  );
}

async function listPostgresUsers(client: pg.Client, masterUser: string): Promise<PgUserRow[]> {
  const result = await client.query<{
    username: string;
    is_superuser: boolean;
    can_create_db: boolean;
    can_create_role: boolean;
    member_roles: string[] | null;
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
      const memberRoles = row.member_roles ?? [];
      return {
        username: row.username,
        appRole: appRoleFromPgRoles(memberRoles),
        roles: memberRoles.length ? memberRoles.join(", ") : "(none)",
        isSuperuser: row.is_superuser,
        canCreateDb: row.can_create_db,
        canCreateRole: row.can_create_role,
      };
    });
}

function upsertComponentId(ctx: ComponentCtx): number {
  sqlite.prepare(`
    INSERT INTO components (org, project, env, component)
    VALUES (@org, @project, @env, @component)
    ON CONFLICT(org, project, env, component) DO UPDATE SET org = excluded.org
  `).run(ctx);

  const row = sqlite
    .prepare(
      `SELECT id FROM components WHERE org = ? AND project = ? AND env = ? AND component = ?`,
    )
    .get(ctx.org, ctx.project, ctx.env, ctx.component) as { id: number };
  return row.id;
}

function storeUsers(componentId: number, users: PgUserRow[]): void {
  const syncedAt = new Date().toISOString();
  const deleteStmt = sqlite.prepare(`DELETE FROM pg_users WHERE component_id = ?`);
  const insertStmt = sqlite.prepare(`
    INSERT INTO pg_users (
      component_id, username, app_role, roles, is_superuser, can_create_db, can_create_role, synced_at
    ) VALUES (
      @componentId, @username, @appRole, @roles, @isSuperuser, @canCreateDb, @canCreateRole, @syncedAt
    )
  `);

  const tx = sqlite.transaction(() => {
    deleteStmt.run(componentId);
    for (const user of users) {
      insertStmt.run({
        componentId,
        username: user.username,
        appRole: user.appRole,
        roles: user.roles,
        isSuperuser: user.isSuperuser ? 1 : 0,
        canCreateDb: user.canCreateDb ? 1 : 0,
        canCreateRole: user.canCreateRole ? 1 : 0,
        syncedAt,
      });
    }
  });
  tx();
}

async function syncComponentUsers(ctx: ComponentCtx): Promise<{ count: number; syncedAt: string }> {
  const db = await resolveDbForComponent(ctx);
  const users = await withPgClient(db, async (client) => {
    await ensureAppRoles(client, db.database);
    return listPostgresUsers(client, db.username);
  });

  const componentId = upsertComponentId(ctx);
  storeUsers(componentId, users);
  const syncedAt = new Date().toISOString();
  console.log(
    `[INFO] synced ${users.length} users for ${ctx.org}/${ctx.project}/${ctx.env}/${ctx.component}`,
  );
  return { count: users.length, syncedAt };
}

async function resyncAllComponents(): Promise<{ components: number; users: number }> {
  const rows = sqlite.prepare(`SELECT org, project, env, component FROM components`).all() as ComponentCtx[];
  let users = 0;
  for (const ctx of rows) {
    const result = await syncComponentUsers(ctx);
    users += result.count;
  }
  return { components: rows.length, users };
}

function clearPluginData(): void {
  sqlite.exec(`DELETE FROM pg_users; DELETE FROM components;`);
}

function validateUsername(username: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(username)) {
    throw new Error(
      "Username must start with a letter or underscore and contain only letters, digits, or underscores (max 63 chars).",
    );
  }
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

function parseAppRole(role: string): AppRole {
  if (role === "readonly" || role === "readwrite" || role === "admin") return role;
  throw new Error(`Invalid role "${role}". Expected readonly, readwrite, or admin.`);
}

async function createDatabaseUser(
  ctx: ComponentCtx,
  username: string,
  password: string,
  role: AppRole,
): Promise<void> {
  validateUsername(username);
  validatePassword(password);

  const db = await resolveDbForComponent(ctx);
  if (isProtectedUser(username, db.username)) {
    throw new Error(`Cannot create reserved username "${username}".`);
  }

  await withPgClient(db, async (client) => {
    await ensureAppRoles(client, db.database);
    const exists = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [username]);
    if (exists.rowCount && exists.rowCount > 0) {
      throw new Error(`User "${username}" already exists.`);
    }

    const userIdent = quoteIdent(username);
    const pgRole = APP_ROLES[role];
    await client.query(`CREATE ROLE ${userIdent} LOGIN PASSWORD $1`, [password]);
    await client.query(`GRANT ${quoteIdent(pgRole)} TO ${userIdent}`);
  });

  await syncComponentUsers(ctx);
}

async function deleteDatabaseUser(ctx: ComponentCtx, username: string): Promise<void> {
  validateUsername(username);

  const db = await resolveDbForComponent(ctx);
  if (isProtectedUser(username, db.username)) {
    throw new Error(`Cannot delete protected user "${username}".`);
  }

  await withPgClient(db, async (client) => {
    const userIdent = quoteIdent(username);
    const masterIdent = quoteIdent(db.username);
    await client.query(`REASSIGN OWNED BY ${userIdent} TO ${masterIdent}`);
    await client.query(`DROP OWNED BY ${userIdent}`);
    await client.query(`DROP ROLE IF EXISTS ${userIdent}`);
  });

  await syncComponentUsers(ctx);
}

function listStoredUsers(ctx: ComponentCtx): PgUserRow[] {
  const rows = sqlite
    .prepare(`
      SELECT u.username, u.app_role AS appRole, u.roles, u.is_superuser AS isSuperuser,
             u.can_create_db AS canCreateDb, u.can_create_role AS canCreateRole
      FROM pg_users u
      JOIN components c ON c.id = u.component_id
      WHERE c.org = ? AND c.project = ? AND c.env = ? AND c.component = ?
      ORDER BY u.username
    `)
    .all(ctx.org, ctx.project, ctx.env, ctx.component) as Array<{
      username: string;
      appRole: string;
      roles: string;
      isSuperuser: number;
      canCreateDb: number;
      canCreateRole: number;
    }>;

  return rows.map((row) => ({
    username: row.username,
    appRole: row.appRole,
    roles: row.roles,
    isSuperuser: Boolean(row.isSuperuser),
    canCreateDb: Boolean(row.canCreateDb),
    canCreateRole: Boolean(row.canCreateRole),
  }));
}

function renderManagePage(ctx: ComponentCtx, users: PgUserRow[], message = "", error = ""): string {
  const rows =
    users.length === 0
      ? `<tr><td colspan="3" class="muted">No application users yet. Add one below, then refresh the PostgreSQL Users tab.</td></tr>`
      : users
          .map(
            (user) => `
      <tr>
        <td>${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.appRole)}</td>
        <td>
          <button type="button" class="danger" data-delete="${escapeHtml(user.username)}">Remove</button>
        </td>
      </tr>`,
          )
          .join("");

  const alert = error
    ? `<div class="alert error">${escapeHtml(error)}</div>`
    : message
      ? `<div class="alert ok">${escapeHtml(message)}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manage PostgreSQL users</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; }
    body { margin: 0; background: #f4f6fa; color: #1a2233; }
    main { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
    .muted { color: #5c677f; font-size: 0.9rem; }
    .card { background: #fff; border: 1px solid #d8deea; border-radius: 10px; padding: 1rem; margin-top: 1rem; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e7ebf3; padding: 0.65rem 0.5rem; text-align: left; }
    th { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: #5c677f; }
    label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
    input, select, button { font: inherit; }
    input, select { width: 100%; box-sizing: border-box; padding: 0.55rem 0.65rem; border: 1px solid #c9d1e0; border-radius: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
    button { border: 0; border-radius: 8px; padding: 0.55rem 0.9rem; cursor: pointer; background: #1c4fd6; color: #fff; }
    button.secondary { background: #e7ebf3; color: #1a2233; }
    button.danger { background: #c62828; color: #fff; padding: 0.35rem 0.7rem; }
    .alert { padding: 0.75rem 1rem; border-radius: 8px; margin-top: 1rem; }
    .alert.ok { background: #e8f5e9; color: #1b5e20; }
    .alert.error { background: #ffebee; color: #b71c1c; }
  </style>
</head>
<body>
  <main>
    <h1>Manage PostgreSQL users</h1>
    <p class="muted">${escapeHtml(ctx.org)} / ${escapeHtml(ctx.project)} / ${escapeHtml(ctx.env)} / ${escapeHtml(ctx.component)}</p>
    ${alert}

    <section class="card">
      <h2 style="margin:0 0 0.75rem;font-size:1rem;">Add user</h2>
      <form id="create-form" class="grid">
        <div>
          <label for="username">Username</label>
          <input id="username" name="username" required pattern="[A-Za-z_][A-Za-z0-9_]{0,62}" />
        </div>
        <div>
          <label for="password">Password</label>
          <input id="password" name="password" type="password" required minlength="8" autocomplete="new-password" />
        </div>
        <div>
          <label for="role">Role</label>
          <select id="role" name="role">
            <option value="readonly">Read only (SELECT on public schema)</option>
            <option value="readwrite">Read / write (SELECT, INSERT, UPDATE, DELETE)</option>
            <option value="admin">Admin (ALL on public schema objects)</option>
          </select>
        </div>
      </form>
      <div class="actions">
        <button type="submit" form="create-form">Add user</button>
        <button type="button" class="secondary" id="refresh-btn">Refresh from database</button>
      </div>
    </section>

    <section class="card">
      <h2 style="margin:0 0 0.75rem;font-size:1rem;">Existing users</h2>
      <table>
        <thead>
          <tr><th>Username</th><th>Role</th><th></th></tr>
        </thead>
        <tbody id="users-body">${rows}</tbody>
      </table>
    </section>
  </main>
  <script>
    const ctx = ${JSON.stringify(ctx)};
    const base = (() => {
      const path = window.location.pathname;
      const idx = path.indexOf("/iframe");
      if (idx >= 0) return path.slice(0, idx + "/iframe".length).replace(/\\/$/, "");
      return path.replace(/\\/$/, "");
    })();

    async function api(path, options = {}) {
      const res = await fetch(base + path, {
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || res.statusText);
      return body;
    }

    function showMessage(text, isError = false) {
      let node = document.querySelector(".alert");
      if (!node) {
        node = document.createElement("div");
        node.className = "alert";
        document.querySelector("main").insertBefore(node, document.querySelector("main").children[1]);
      }
      node.className = "alert " + (isError ? "error" : "ok");
      node.textContent = text;
    }

    function renderRows(users) {
      const tbody = document.getElementById("users-body");
      if (!users.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted">No application users yet.</td></tr>';
        return;
      }
      tbody.innerHTML = users.map((user) =>
        '<tr><td>' + user.username + '</td><td>' + user.appRole + '</td><td><button type="button" class="danger" data-delete="' + user.username + '">Remove</button></td></tr>'
      ).join("");
      bindDeleteButtons();
    }

    function bindDeleteButtons() {
      document.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const username = btn.getAttribute("data-delete");
          if (!confirm('Remove PostgreSQL user "' + username + '"?')) return;
          try {
            await api("/api/users/" + encodeURIComponent(username), {
              method: "DELETE",
              body: JSON.stringify(ctx),
            });
            const refreshed = await api("/api/sync", { method: "POST", body: JSON.stringify(ctx) });
            renderRows(refreshed.users);
            showMessage('Removed user "' + username + '". Refresh the PostgreSQL Users tab to see the table update.');
          } catch (err) {
            showMessage(err.message, true);
          }
        });
      });
    }

    document.getElementById("create-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.target;
      const payload = {
        ...ctx,
        username: form.username.value.trim(),
        password: form.password.value,
        role: form.role.value,
      };
      try {
        await api("/api/users", { method: "POST", body: JSON.stringify(payload) });
        const refreshed = await api("/api/sync", { method: "POST", body: JSON.stringify(ctx) });
        renderRows(refreshed.users);
        form.password.value = "";
        showMessage('Created user "' + payload.username + '" with role "' + payload.role + '".');
      } catch (err) {
        showMessage(err.message, true);
      }
    });

    document.getElementById("refresh-btn").addEventListener("click", async () => {
      try {
        const refreshed = await api("/api/sync", { method: "POST", body: JSON.stringify(ctx) });
        renderRows(refreshed.users);
        showMessage("Synced " + refreshed.count + " users from PostgreSQL.");
      } catch (err) {
        showMessage(err.message, true);
      }
    });

    bindDeleteButtons();
    api("/api/sync", { method: "POST", body: JSON.stringify(ctx) })
      .then((refreshed) => renderRows(refreshed.users))
      .catch((err) => showMessage(err.message, true));
  </script>
</body>
</html>`;
}

async function handleManagePage(
  url: URL,
  req: IncomingMessage,
  rawPathname: string,
  res: ServerResponse,
): Promise<void> {
  const ctx = parseComponentCtx(url, req, rawPathname);
  if (!ctx) {
    send(res, 400, { error: "Missing component context" });
    return;
  }

  try {
    await syncComponentUsers(ctx);
    const users = listStoredUsers(ctx);
    send(res, 200, renderManagePage(ctx, users), "text/html; charset=utf-8");
  } catch (err) {
    send(
      res,
      500,
      renderManagePage(ctx, [], "", (err as Error).message),
      "text/html; charset=utf-8",
    );
  }
}

async function handleApiSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = JSON.parse(await readBody(req)) as ComponentCtx;
    if (!body.org || !body.project || !body.env || !body.component) {
      send(res, 400, { error: "Missing component context in request body" });
      return;
    }
    const result = await syncComponentUsers(body);
    send(res, 200, { ...result, users: listStoredUsers(body) });
  } catch (err) {
    send(res, 500, { error: (err as Error).message });
  }
}

async function handleApiCreateUser(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = JSON.parse(await readBody(req)) as ComponentCtx & {
      username?: string;
      password?: string;
      role?: string;
    };
    if (!body.org || !body.project || !body.env || !body.component) {
      send(res, 400, { error: "Missing component context" });
      return;
    }
    if (!body.username || !body.password || !body.role) {
      send(res, 400, { error: "username, password, and role are required" });
      return;
    }
    const role = parseAppRole(body.role);
    await createDatabaseUser(body, body.username.trim(), body.password, role);
    send(res, 201, { ok: true, username: body.username, role });
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
}

async function handleApiDeleteUser(
  req: IncomingMessage,
  res: ServerResponse,
  username: string,
): Promise<void> {
  try {
    const body = JSON.parse(await readBody(req)) as ComponentCtx;
    if (!body.org || !body.project || !body.env || !body.component) {
      send(res, 400, { error: "Missing component context" });
      return;
    }
    await deleteDatabaseUser(body, username);
    send(res, 200, { ok: true, username });
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
}

async function handleResync(res: ServerResponse): Promise<void> {
  try {
    const result = await resyncAllComponents();
    send(res, 200, { started: true, ...result });
  } catch (err) {
    send(res, 500, { started: false, error: (err as Error).message });
  }
}

async function handleEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const raw = await readBody(req);
    if (raw) {
      const event = JSON.parse(raw) as {
        entity?: string;
        action?: string;
        organization?: { canonical?: string };
        project?: { canonical?: string };
        environment?: { canonical?: string };
        component?: { canonical?: string };
      };
      if (
        event.entity === "component" &&
        event.organization?.canonical &&
        event.project?.canonical &&
        event.environment?.canonical &&
        event.component?.canonical
      ) {
        await syncComponentUsers({
          org: event.organization.canonical,
          project: event.project.canonical,
          env: event.environment.canonical,
          component: event.component.canonical,
        });
      }
    }
    send(res, 200, { ok: true });
  } catch (err) {
    console.error(`[ERROR] event handler: ${(err as Error).message}`);
    send(res, 200, { ok: true, warning: (err as Error).message });
  }
}

const server = createServer((req, res) => {
  const start = Date.now();
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const rawPathname = url.pathname;
  const pathname = normalizePluginPath(rawPathname);

  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${method} ${pathname} → ${res.statusCode} (${ms}ms)`);
  });

  if (method === "GET" && pathname === "/_cy/ping") return send(res, 200, { ok: true });

  if (method === "POST" && pathname === "/_cy/events") {
    handleEvents(req, res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  if (method === "DELETE" && pathname === "/_cy/plugin") {
    clearPluginData();
    return send(res, 200, { ok: true });
  }

  if (method === "POST" && pathname === "/_cy/resync") {
    handleResync(res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  if (method === "GET" && pathname === "/ui/manage") {
    handleManagePage(url, req, rawPathname, res).catch((err) =>
      send(res, 500, { error: (err as Error).message }),
    );
    return;
  }

  if (method === "POST" && pathname === "/api/sync") {
    handleApiSync(req, res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  if (method === "POST" && pathname === "/api/users") {
    handleApiCreateUser(req, res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  const deleteMatch = /^\/api\/users\/([^/]+)$/.exec(pathname);
  if (method === "DELETE" && deleteMatch) {
    handleApiDeleteUser(req, res, decodeURIComponent(deleteMatch[1])).catch((err) =>
      send(res, 500, { error: (err as Error).message }),
    );
    return;
  }

  send(res, 404, { error: "Not Found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port}`);
});
