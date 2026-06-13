import { createServer, type IncomingMessage, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const ADMINER_PORT = process.env.ADMINER_PORT?.trim() || "8081";

// Adminer sets X-Frame-Options: deny — must strip so Cycloid can embed the UI in an iframe.
const STRIPPED_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
]);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function filterProxyResponseHeaders(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === "location" && typeof value === "string" && value.includes("127.0.0.1")) {
      try {
        const loc = new URL(value);
        out[key] = loc.pathname + loc.search;
      } catch {
        out[key] = value;
      }
      continue;
    }
    out[key] = value;
  }
  return out;
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

function normalizePluginPath(pathname: string): string {
  const iframeIdx = pathname.indexOf("/iframe");
  if (iframeIdx >= 0) {
    const rest = pathname.slice(iframeIdx + "/iframe".length);
    if (!rest || rest === "/") return "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  return pathname || "/";
}

function resolvePathname(url: URL, rawPathname: string): string {
  const proxyPath = url.searchParams.get("path")?.trim();
  if (proxyPath) {
    const normalized = proxyPath.startsWith("/") ? proxyPath : `/${proxyPath}`;
    return normalized.replace(/\/$/, "") || "/";
  }
  return normalizePluginPath(rawPathname);
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function proxyAdminer(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  search: string,
): void {
  const targetPath = `${pathname}${search}`;

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
      path: targetPath,
      method: req.method,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, filterProxyResponseHeaders(upstreamRes.headers));
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (err) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Adminer unavailable: ${(err as Error).message}`);
  });

  req.pipe(upstream);
}

const server = createServer((req, res) => {
  const start = Date.now();
  const method = req.method ?? "GET";
  const url = parseRequestUrl(req);
  const pathname = resolvePathname(url, url.pathname);

  res.on("finish", () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";
    console.log(`[${level}] ${method} ${pathname} → ${res.statusCode} (${ms}ms)`);
  });

  if (method === "GET" && pathname === "/_cy/ping") return sendJson(res, 200, { ok: true });
  if (method === "POST" && pathname === "/_cy/events") return sendJson(res, 200, { ok: true });
  if (method === "DELETE" && pathname === "/_cy/plugin") return sendJson(res, 200, { ok: true });
  if (method === "POST" && pathname === "/_cy/resync") return sendJson(res, 200, { started: false });

  proxyAdminer(req, res, pathname, url.search);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port} (adminer on 127.0.0.1:${ADMINER_PORT})`);
});
