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

function boolCell(value: boolean): string {
  return value ? "yes" : "no";
}

function renderUsersPage(ctx: ComponentCtx, users: PgUserRow[], syncedAt: string, error = ""): string {
  const rows =
    users.length === 0
      ? `<tr><td colspan="7" class="muted">No application users found.</td></tr>`
      : users
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

  const errorBlock = error
    ? `<div class="alert">${escapeHtml(error)}</div>`
    : "";

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
    <p class="muted">${escapeHtml(ctx.org)} / ${escapeHtml(ctx.project)} / ${escapeHtml(ctx.env)} / ${escapeHtml(ctx.component)}</p>
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
        <tbody>${rows}</tbody>
      </table>
    </div>
  </main>
</body>
</html>`;
}

async function handleUsersPage(
  url: URL,
  req: IncomingMessage,
  rawPathname: string,
  res: ServerResponse,
): Promise<void> {
  const ctx = parseComponentCtx(url, req, rawPathname);
  if (!ctx) {
    send(
      res,
      400,
      renderUsersPage(
        { org: "?", project: "?", env: "?", component: "?" },
        [],
        "",
        "Missing component context in the iframe URL.",
      ),
      "text/html; charset=utf-8",
    );
    return;
  }

  try {
    const { users, syncedAt } = await syncComponentUsers(ctx);
    send(res, 200, renderUsersPage(ctx, users, syncedAt), "text/html; charset=utf-8");
  } catch (err) {
    send(
      res,
      500,
      renderUsersPage(ctx, [], "", (err as Error).message),
      "text/html; charset=utf-8",
    );
  }
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

async function syncComponentUsers(
  ctx: ComponentCtx,
): Promise<{ count: number; syncedAt: string; users: PgUserRow[] }> {
  const db = await resolveDbForComponent(ctx);
  const users = await withPgClient(db, (client) => listPostgresUsers(client, db.username));

  const componentId = upsertComponentId(ctx);
  storeUsers(componentId, users);
  const syncedAt = new Date().toISOString();
  console.log(
    `[INFO] synced ${users.length} users for ${ctx.org}/${ctx.project}/${ctx.env}/${ctx.component}`,
  );
  return { count: users.length, syncedAt, users };
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

async function handleEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const raw = await readBody(req);
    if (raw) {
      const event = JSON.parse(raw) as {
        entity?: string;
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

async function handleResync(res: ServerResponse): Promise<void> {
  try {
    const result = await resyncAllComponents();
    send(res, 200, { started: true, ...result });
  } catch (err) {
    send(res, 500, { started: false, error: (err as Error).message });
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

  if (method === "GET" && pathname === "/ui/users") {
    handleUsersPage(url, req, rawPathname, res).catch((err) => {
      send(
        res,
        500,
        renderUsersPage(
          { org: "?", project: "?", env: "?", component: "?" },
          [],
          "",
          (err as Error).message,
        ),
        "text/html; charset=utf-8",
      );
    });
    return;
  }

  send(res, 404, { error: "Not Found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port}`);
});
