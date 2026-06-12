import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createConnection } from "node:net";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

function normalizeApiBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed || trimmed === "<no value>") return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeProxyBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed || trimmed === "<no value>") return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function apiUrl(path: string, base: string, label: string): URL {
  try {
    return new URL(path, base);
  } catch (err) {
    throw new Error(
      `Invalid ${label} "${base}": ${(err as Error).message}. Use a full URL such as https://api.us.cycloid.io or leave cy_api_url empty when PROXY_URL is injected.`,
    );
  }
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

const DB_PORT = process.env.DB_PORT?.trim() || "5432";
const ADMINER_PORT = process.env.ADMINER_PORT?.trim() || "8081";
const ADMINER_ORIGIN = `http://127.0.0.1:${ADMINER_PORT}`;
const PROXY_URL = normalizeProxyBase(process.env.PROXY_URL ?? "");
const PLUGIN_SECRET = process.env.PLUGIN_SECRET?.trim() ?? "";
const CY_API_URL = normalizeApiBase(process.env.CY_API_URL ?? "");
const CY_API_KEY = process.env.CY_API_KEY?.trim() ?? "";

function apiModeLabel(): string {
  if (CY_API_URL && CY_API_KEY) {
    return `direct (${CY_API_URL})`;
  }
  if (PROXY_URL) {
    return `proxy (${PROXY_URL}, secret=${PLUGIN_SECRET ? "set" : "empty"}) — set cy_api_key to avoid iframe deadlocks`;
  }
  return "not configured";
}

console.log(`[INFO] cycloid api: ${apiModeLabel()}`);

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
    ssl: resolvedHost.includes(".rds.amazonaws.com") || resolvedHost.includes(".postgres.database.azure.com"),
  };
}

function testDbReachability(db: DbConfig): Promise<void> {
  const port = Number(db.port);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: db.host, port, timeout: 5000 }, () => {
      socket.end();
      resolve();
    });
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`timed out after 5s connecting to ${db.host}:${db.port}`));
    });
  });
}

function dbReachabilityHint(db: DbConfig, err: Error): string {
  return [
    `Could not open a TCP connection to PostgreSQL at ${db.host}:${db.port}.`,
    "",
    `Details: ${err.message}`,
    "",
    "The Adminer UI runs inside the Cycloid plugin container. That container must",
    "be able to reach the database host on port 5432 (same as from a bastion or VPN).",
    "",
    "Common causes:",
    "  - RDS / Azure / Cloud SQL is in a private subnet with no route from the plugin sandbox",
    "  - Security group / firewall allows the app but not the plugin network",
    "  - Database is not publicly accessible and no VPC peering to the plugin runtime",
    "",
    "Fix: expose the DB to the plugin network, run the plugin where it can reach the DB,",
    "or use a publicly reachable endpoint with the correct security rules.",
  ].join("\n");
}

function cycloidApiError(): string {
  return [
    "Cannot reach the Cycloid API to read Terraform outputs.",
    "",
    "Set at plugin install time:",
    "  cy_api_url  — e.g. https://api.us.cycloid.io (US) or https://http-api.cycloid.io (EU)",
    "  cy_api_key  — org API key with inventory output read access",
    "",
    "Direct API access is required for iframe widgets: calling PROXY_URL while handling",
    "an iframe request can deadlock the Plugin Manager (API → PM → plugin → PM → API).",
  ].join("\n");
}

const CY_HTTP_TIMEOUT_MS = 15_000;

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
        timeout: CY_HTTP_TIMEOUT_MS,
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
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`HTTP timeout after ${CY_HTTP_TIMEOUT_MS}ms calling ${target.origin}`));
    });
    req.on("error", reject);
    req.end();
  });
}

async function cycloidGet(path: string): Promise<{ status: number; body: string }> {
  const failures: string[] = [];

  // Prefer direct API: iframe requests already go through Plugin Manager
  // (API → PM → plugin). Calling PROXY_URL from the plugin re-enters PM and can deadlock.
  if (CY_API_URL && CY_API_KEY) {
    try {
      const url = apiUrl(path, CY_API_URL, "cy_api_url");
      return await httpGet(url, { authorization: `Bearer ${CY_API_KEY}` });
    } catch (err) {
      failures.push((err as Error).message);
    }
  }

  if (PROXY_URL) {
    try {
      const url = apiUrl(path, PROXY_URL, "PROXY_URL");
      if (PLUGIN_SECRET) {
        url.searchParams.set("secret", PLUGIN_SECRET);
      }
      return await httpGet(url, {});
    } catch (err) {
      failures.push((err as Error).message);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join(" "));
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

function renderErrorPage(title: string, message: string, ctx?: ComponentCtx): string {
  const scope = ctx
    ? `<p class="muted">${escapeHtml(ctx.org)} / ${escapeHtml(ctx.project)} / ${escapeHtml(ctx.env)} / ${escapeHtml(ctx.component)}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a2233; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    .muted { color: #5c677f; }
    pre { background: #f4f6fa; padding: 1rem; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${scope}
  <pre>${escapeHtml(message)}</pre>
</body>
</html>`;
}

function renderAdminPage(db: DbConfig, ctx: ComponentCtx): string {
  const server = `${db.host}:${db.port}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Adminer</title>
  <style>
    html, body { margin: 0; height: 100%; background: #f4f6fa; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <form id="adminer-login" class="hidden" method="post" action="adminer/" target="adminer-frame">
    <input type="hidden" name="auth[driver]" value="pgsql" />
    <input type="hidden" name="auth[server]" value="${escapeHtml(server)}" />
    <input type="hidden" name="auth[username]" value="${escapeHtml(db.username)}" />
    <input type="hidden" name="auth[password]" value="${escapeHtml(db.password)}" />
    <input type="hidden" name="auth[db]" value="${escapeHtml(db.database)}" />
    ${db.ssl ? '<input type="hidden" name="auth[ssl]" value="1" />' : ""}
  </form>
  <iframe name="adminer-frame" title="Database admin (${escapeHtml(ctx.component)})"></iframe>
  <script>
    const base = (() => {
      const path = window.location.pathname;
      const idx = path.indexOf("/iframe");
      if (idx >= 0) return path.slice(0, idx + "/iframe".length).replace(/\\/$/, "");
      return path.replace(/\\/$/, "");
    })();
    document.getElementById("adminer-login").action = base + "/adminer/";
    document.getElementById("adminer-login").submit();
  </script>
</body>
</html>`;
}

function proxyAdminer(req: IncomingMessage, res: ServerResponse, pathname: string): void {
  const suffix = pathname.replace(/^\/adminer/, "") || "/";
  const target = new URL(suffix, `${ADMINER_ORIGIN}/`);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key === "host") continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers.host = `127.0.0.1:${ADMINER_PORT}`;

  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: Number(ADMINER_PORT),
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    send(res, 502, renderErrorPage("Adminer unavailable", (err as Error).message), "text/html; charset=utf-8");
  });

  req.pipe(upstream);
}

async function renderMainPage(
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
      renderErrorPage(
        "Missing component context",
        "Could not determine org, project, environment, and component from the iframe URL, query string, or Referer header.",
      ),
      "text/html; charset=utf-8",
    );
    return;
  }

  try {
    const outputs = await fetchComponentOutputs(ctx);
    const db = resolveDbConfig(outputs);
    if (!db) {
      const keys = [...outputs.keys()].sort().join(", ") || "(none)";
      send(
        res,
        404,
        renderErrorPage(
          "Database credentials not found",
          `No usable PostgreSQL outputs for this component. Found keys: ${keys}\n\nExpected outputs such as rds_address, rds_username, rds_password (AWS), postgresql_server_fqdn + connection_string (Azure), or public_ip_address + database_user + database_password (GCP).`,
          ctx,
        ),
        "text/html; charset=utf-8",
      );
      return;
    }

    try {
      await testDbReachability(db);
    } catch (err) {
      send(
        res,
        502,
        renderErrorPage("Cannot reach database host", dbReachabilityHint(db, err as Error), ctx),
        "text/html; charset=utf-8",
      );
      return;
    }

    send(res, 200, renderAdminPage(db, ctx), "text/html; charset=utf-8");
  } catch (err) {
    send(
      res,
      500,
      renderErrorPage("Failed to load database connection", (err as Error).message, ctx),
      "text/html; charset=utf-8",
    );
  }
}

const server = createServer((req, res) => {
  const start = Date.now();
  const method = req.method ?? "GET";
  const url = parseRequestUrl(req);
  const rawPathname = url.pathname;
  const pathname = normalizePluginPath(rawPathname);

  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${method} ${pathname} → ${res.statusCode} (${ms}ms)`);
  });

  if (method === "GET" && pathname === "/_cy/ping") return send(res, 200, { ok: true });
  if (method === "POST" && pathname === "/_cy/events") return send(res, 200, { ok: true });
  if (method === "DELETE" && pathname === "/_cy/plugin") return send(res, 200, { ok: true });
  if (method === "POST" && pathname === "/_cy/resync") return send(res, 200, { started: false });

  if (pathname === "/adminer" || pathname.startsWith("/adminer/")) {
    return proxyAdminer(req, res, pathname);
  }

  if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    renderMainPage(url, req, rawPathname, res).catch((err) => {
      send(res, 500, renderErrorPage("Internal error", (err as Error).message), "text/html; charset=utf-8");
    });
    return;
  }

  send(res, 404, "Not Found", "text/plain; charset=utf-8");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port} (adminer on ${ADMINER_ORIGIN})`);
});
