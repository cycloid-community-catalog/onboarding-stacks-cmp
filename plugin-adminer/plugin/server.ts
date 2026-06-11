import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const DB_PORT = process.env.DB_PORT?.trim() || "5432";
const ADMINER_PORT = process.env.ADMINER_PORT?.trim() || "8081";
const ADMINER_ORIGIN = `http://127.0.0.1:${ADMINER_PORT}`;
const PROXY_URL = process.env.PROXY_URL?.trim().replace(/\/$/, "") ?? "";
const PLUGIN_SECRET = process.env.PLUGIN_SECRET?.trim() ?? "";
const CY_API_URL = process.env.CY_API_URL?.trim().replace(/\/$/, "") ?? "";
const CY_API_KEY = process.env.CY_API_KEY?.trim() ?? "";

function apiModeLabel(): string {
  if (PROXY_URL) {
    return `proxy (${PROXY_URL}, secret=${PLUGIN_SECRET ? "set" : "empty"})`;
  }
  if (CY_API_URL && CY_API_KEY) {
    return `direct (${CY_API_URL})`;
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
};

function stripIframePrefix(pathname: string): string {
  return pathname.replace(/^\/iframe/, "") || "/";
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

function parseComponentCtx(url: URL): ComponentCtx | null {
  const org = url.searchParams.get("org")?.trim() ?? "";
  const project = url.searchParams.get("project")?.trim() ?? "";
  const env = url.searchParams.get("env")?.trim() ?? "";
  const component = url.searchParams.get("component")?.trim() ?? "";
  if (!org || !project || !env || !component) return null;
  return { org, project, env, component };
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
  };
}

function cycloidApiError(): string {
  return [
    "Cannot reach the Cycloid API to read Terraform outputs.",
    "",
    "Expected (injected by Plugin Manager at install time):",
    "  PROXY_URL=<plugin-manager-proxy>",
    "  PLUGIN_SECRET=<per-plugin-secret>  (may be empty if PLUGIN_TOKEN_SECRET is unset)",
    "",
    "Workaround: reinstall the plugin with install-form fields:",
    "  cy_api_url  — e.g. https://http-api.cycloid.io",
    "  cy_api_key  — org API key with inventory output read access",
    "",
    "Platform admin: ensure Plugin Manager has HOST_API_BASE_URL and CY_TOKEN_SECRET configured,",
    "then restart Plugin Manager and reinstall this plugin.",
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
  </form>
  <iframe name="adminer-frame" title="Database admin (${escapeHtml(ctx.component)})"></iframe>
  <script>
    const base = window.location.pathname.replace(/\/$/, "");
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

async function renderMainPage(url: URL, res: ServerResponse): Promise<void> {
  const ctx = parseComponentCtx(url);
  if (!ctx) {
    send(
      res,
      400,
      renderErrorPage(
        "Missing component context",
        "Expected org, project, env, and component query parameters from the Cycloid iframe URL.",
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
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = stripIframePrefix(url.pathname);

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
    renderMainPage(url, res).catch((err) => {
      send(res, 500, renderErrorPage("Internal error", (err as Error).message), "text/html; charset=utf-8");
    });
    return;
  }

  send(res, 404, "Not Found", "text/plain; charset=utf-8");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port} (adminer on ${ADMINER_ORIGIN})`);
});
