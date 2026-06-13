import { createServer, type IncomingMessage, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const ADMINER_PORT = process.env.ADMINER_PORT?.trim() || "8081";

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

/** Runs in the iframe document; fixes URLs using window.location (server only sees "/"). */
const IFRAME_CLIENT_SCRIPT = `<script>(function(){function ib(){var p=location.pathname,i=p.indexOf("/iframe");return i<0?null:location.origin+p.slice(0,i+"/iframe".length)+"/"}function fix(u){var b=ib();if(!b||!u)return u;if(/^https?:\\/\\//i.test(u)||u.indexOf("//")===0)return u;if(u.charAt(0)==="/")return b.replace(/\\/$/,"")+u;if(u.charAt(0)==="?")return b.replace(/\\/?$/,"/")+u;return u}var b=ib();if(b){var base=document.createElement("base");base.href=b;(document.head||document.documentElement).prepend(base);document.cookie="cy_adminer_base="+encodeURIComponent(new URL(b).pathname.replace(/\\/$/,""))+"; path=/; secure; samesite=none"}function fixAll(){document.querySelectorAll("a[href],form[action]").forEach(function(el){var a=el.hasAttribute("href")?"href":"action";var v=el.getAttribute(a);if(v&&v.charAt(0)==="/")el.setAttribute(a,fix(v))})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fixAll);else fixAll();document.addEventListener("submit",function(e){var f=e.target;if(f&&f.action)f.action=fix(f.action)},true)})();</script>`;

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

function iframeBaseFromCookie(cookieHeader: string | undefined, origin: string): { href: string; path: string } | null {
  if (!cookieHeader) return null;
  const match = /(?:^|;\s*)cy_adminer_base=([^;]*)/.exec(cookieHeader);
  if (!match) return null;
  try {
    const path = decodeURIComponent(match[1]).trim();
    if (!path.includes("/iframe")) return null;
    return { path, href: `${origin}${path}/` };
  } catch {
    return null;
  }
}

function getPublicBase(req: IncomingMessage, url: URL): { href: string; path: string } {
  const fromCookie = iframeBaseFromCookie(req.headers.cookie, url.origin);
  if (fromCookie) return fromCookie;

  const referer = req.headers.referer ?? req.headers.referrer;
  if (typeof referer === "string" && referer) {
    try {
      const ref = new URL(referer);
      const path = iframeBaseFromPathname(ref.pathname);
      if (path) return { href: `${ref.origin}${path}/`, path };
    } catch {
      /* ignore malformed referer */
    }
  }

  const path = iframeBaseFromPathname(url.pathname);
  if (path) return { href: `${url.origin}${path}/`, path };
  return { href: "", path: "" };
}

function rewriteLocation(location: string, publicBasePath: string): string {
  if (!publicBasePath) return location;

  let pathAndQuery = location;
  if (/^https?:\/\//i.test(location)) {
    try {
      const parsed = new URL(location);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      } else if (iframeBaseFromPathname(parsed.pathname)) {
        return location;
      } else {
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return location;
    }
  }

  if (pathAndQuery.startsWith(publicBasePath)) return pathAndQuery;
  if (pathAndQuery.startsWith("/")) return `${publicBasePath}${pathAndQuery}`;
  return `${publicBasePath}/${pathAndQuery}`;
}

function rewriteSetCookie(cookie: string, publicBasePath: string): string {
  let out = cookie;
  const pathValue = publicBasePath ? `${publicBasePath}/` : "/";
  if (/;\s*path=/i.test(out)) {
    out = out.replace(/;\s*path=[^;]*/i, `; Path=${pathValue}`);
  } else {
    out += `; Path=${pathValue}`;
  }
  if (!/;\s*samesite=/i.test(out)) {
    out += "; SameSite=None; Secure";
  } else {
    out = out.replace(/;\s*samesite=[^;]*/i, "; SameSite=None");
    if (!/;\s*secure(?:;|$)/i.test(out)) out += "; Secure";
  }
  return out;
}

function filterProxyResponseHeaders(
  headers: IncomingHttpHeaders,
  publicBasePath: string,
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === "location" && typeof value === "string") {
      out[key] = rewriteLocation(value, publicBasePath);
      continue;
    }
    if (lower === "set-cookie") {
      const cookies = Array.isArray(value) ? value : [value];
      out[key] = cookies.map((cookie) => rewriteSetCookie(String(cookie), publicBasePath));
      continue;
    }
    out[key] = value;
  }
  return out;
}

function rewriteRootRelativeUrls(html: string, publicBasePath: string): string {
  if (!publicBasePath || !html.includes("/")) return html;
  return html.replace(
    /(\s(?:action|href|src)\s*=\s*["'])\/(?!\/)/gi,
    `$1${publicBasePath}/`,
  );
}

function injectIframeFixes(html: string, publicBase: { href: string; path: string }): string {
  if (!html.includes("<")) return html;

  let out = html;
  if (publicBase.path) {
    out = rewriteRootRelativeUrls(out, publicBase.path);
    if (publicBase.href && !/<base[\s>]/i.test(out)) {
      const escaped = publicBase.href.replace(/"/g, "&quot;");
      const tag = `<base href="${escaped}">`;
      out = /<head[\s>]/i.test(out)
        ? out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${tag}`)
        : `${tag}${out}`;
    }
  }

  if (/<head[\s>]/i.test(out)) {
    return out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${IFRAME_CLIENT_SCRIPT}`);
  }
  return `${IFRAME_CLIENT_SCRIPT}${out}`;
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
  const publicBase = getPublicBase(req, requestUrl);

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
      const responseHeaders = filterProxyResponseHeaders(upstreamRes.headers, publicBase.path);

      if (!isHtml) {
        delete responseHeaders["content-length"];
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        upstreamRes.pipe(res);
        return;
      }

      const chunks: Buffer[] = [];
      upstreamRes.on("data", (chunk: Buffer) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = Buffer.from(injectIframeFixes(raw, publicBase), "utf8");
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
