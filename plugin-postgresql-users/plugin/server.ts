import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import pg from "pg";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL?.trim() ?? "";

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
  console.log("[INFO] database: configured via DATABASE_URL");
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

function parseDatabaseUrl(value: string): DbConfig | null {
  try {
    const normalized = value.replace(/^postgres:\/\//, "postgresql://");
    const url = new URL(normalized);
    const host = url.hostname;
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (!host || !username || !password) return null;

    return {
      host,
      port: url.port || "5432",
      username,
      password,
      database: url.pathname.replace(/^\//, "") || "postgres",
      ssl:
        host.includes(".rds.amazonaws.com") || host.includes(".postgres.database.azure.com"),
    };
  } catch {
    const legacy =
      /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/.exec(value);
    if (!legacy) return null;
    const host = legacy[3];
    return {
      username: decodeURIComponent(legacy[1]),
      password: decodeURIComponent(legacy[2]),
      host,
      port: legacy[4] || "5432",
      database: legacy[5] || "postgres",
      ssl: host.includes(".rds.amazonaws.com") || host.includes(".postgres.database.azure.com"),
    };
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
    throw new Error(
      "Invalid database_url. Expected postgresql://user:password@host:5432/database",
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
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function appRoleLabel(roleNames: string[]): string {
  if (roleNames.includes("cycloid_app_readonly")) return "readonly";
  if (roleNames.includes("cycloid_app_readwrite")) return "readwrite";
  if (roleNames.includes("cycloid_app_admin")) return "admin";
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
    return `<tr><td colspan="7" class="muted">No application users found.</td></tr>`;
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
  </style>
</head>
<body>
  <main>
    <h1>PostgreSQL users</h1>
    <p class="muted">Read-only list of application login roles</p>
    ${errorBlock}
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
          </tr>
        </thead>
        <tbody id="users-body">${rows}</tbody>
      </table>
    </div>
  </main>
</body>
</html>`;
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
    fetchUsers()
      .then(({ users, syncedAt }) => send(res, 200, renderUsersPage(users, syncedAt), "text/html; charset=utf-8"))
      .catch((err) =>
        send(res, 200, renderUsersPage([], "", (err as Error).message), "text/html; charset=utf-8"),
      );
    return;
  }

  if (method === "GET" && pathname === "/api/users") {
    handleUsersApi(res).catch((err) => send(res, 500, { error: (err as Error).message }));
    return;
  }

  send(res, 404, { error: "Not Found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port}`);
});
