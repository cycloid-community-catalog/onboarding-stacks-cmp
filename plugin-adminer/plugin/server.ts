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

function iframeBaseFromPathname(pathname: string): string {
  const iframeIdx = pathname.indexOf("/iframe");
  if (iframeIdx < 0) return "";
  return pathname.slice(0, iframeIdx + "/iframe".length);
}

/** Public URL prefix for the Cycloid iframe (e.g. https://api…/organizations/…/iframe/). */
function getPublicBaseHref(req: IncomingMessage, url: URL): string {
  const referer = req.headers.referer ?? req.headers.referrer;
  if (typeof referer === "string" && referer) {
    try {
      const ref = new URL(referer);
      const basePath = iframeBaseFromPathname(ref.pathname);
      if (basePath) return `${ref.origin}${basePath}/`;
    } catch {
      /* ignore malformed referer */
    }
  }

  const basePath = iframeBaseFromPathname(url.pathname);
  if (basePath) return `${url.origin}${basePath}/`;
  return "";
}

function rewriteLocation(location: string, publicBaseHref: string): string {
  if (!publicBaseHref) return location;

  let pathAndQuery = location;
  if (/^https?:\/\//i.test(location)) {
    try {
      const parsed = new URL(location);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      } else {
        const basePath = iframeBaseFromPathname(parsed.pathname);
        if (basePath) return location;
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return location;
    }
  }

  const publicBasePath = new URL(publicBaseHref).pathname.replace(/\/$/, "");
  if (pathAndQuery.startsWith(publicBasePath)) return pathAndQuery;

  if (pathAndQuery.startsWith("/")) {
    return `${publicBasePath}${pathAndQuery}`;
  }
  return `${publicBasePath}/${pathAndQuery}`;
}

function filterProxyResponseHeaders(
  headers: IncomingHttpHeaders,
  publicBaseHref: string,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === "location" && typeof value === "string") {
      out[key] = rewriteLocation(value, publicBaseHref);
      continue;
    }
    out[key] = value;
  }
  return out;
}

function injectBaseHref(html: string, baseHref: string): string {
  if (!baseHref || !html.includes("<")) return html;
  if (/<base[\s>]/i.test(html)) return html;
  const escaped = baseHref.replace(/"/g, "&quot;");
  const tag = `<base href="${escaped}">`;
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${tag}`);
  }
  return `${tag}${html}`;
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
  requestUrl: URL,
): void {
  const targetPath = `${pathname}${search}`;
  const publicBaseHref = getPublicBaseHref(req, requestUrl);

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
      const contentType = String(upstreamRes.headers["content-type"] ?? "");
      const isHtml = contentType.includes("text/html");
      const responseHeaders = filterProxyResponseHeaders(upstreamRes.headers, publicBaseHref);

      if (!publicBaseHref || !isHtml) {
        delete responseHeaders["content-length"];
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
        return;
      }

      const chunks: Buffer[] = [];
      upstreamRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = Buffer.from(injectBaseHref(raw, publicBaseHref), "utf8");
        responseHeaders["content-length"] = String(body.length);
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        res.end(body);
      });
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

  proxyAdminer(req, res, pathname, url.search, url);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port} (adminer on 127.0.0.1:${ADMINER_PORT})`);
});
