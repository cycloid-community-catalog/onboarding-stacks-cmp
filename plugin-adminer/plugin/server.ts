import { createServer, type IncomingMessage, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  console.error("FATAL: PORT environment variable is not set or is invalid");
  process.exit(1);
}

const ADMINER_PORT = process.env.ADMINER_PORT?.trim() || "8081";
const ADMINER_MOUNT = "/adminer";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_INTERNAL_REDIRECTS = 5;
const SESSION_STORE_FILE = process.env.CY_ADMINER_SESSION_FILE?.trim() || "/tmp/cy-adminer-sessions.json";

/** Cycloid may not forward browser Cookie headers to the plugin; bridge Adminer sessions in-process. */
const adminerSessions = new Map<string, { cookieHeader: string; updatedAt: number }>();
/** Short _cy_sk token → canonical widget iframe path (avoids multi-KB query strings). */
const shortSessionKeys = new Map<string, string>();

function loadPersistedSessions(): void {
  try {
    const raw = readFileSync(SESSION_STORE_FILE, "utf8");
    const data = JSON.parse(raw) as {
      sessions?: Record<string, { cookieHeader: string; updatedAt: number }>;
      shortKeys?: Record<string, string>;
    };
    const now = Date.now();
    for (const [key, entry] of Object.entries(data.sessions ?? {})) {
      if (now - entry.updatedAt <= SESSION_TTL_MS) adminerSessions.set(key, entry);
    }
    for (const [short, full] of Object.entries(data.shortKeys ?? {})) {
      if (isCanonicalKey(full)) shortSessionKeys.set(short, full);
    }
    console.log(`[INFO] loaded ${adminerSessions.size} adminer session(s) from disk`);
  } catch {
    /* no persisted sessions yet */
  }
}

function persistSessions(): void {
  try {
    writeFileSync(
      SESSION_STORE_FILE,
      JSON.stringify({
        sessions: Object.fromEntries(adminerSessions),
        shortKeys: Object.fromEntries(shortSessionKeys),
      }),
    );
  } catch (err) {
    console.log(`[WARN] failed to persist adminer sessions: ${(err as Error).message}`);
  }
}

loadPersistedSessions();

/** Strip /adminer suffix, JWT segment, and widget id — stable per component. */
function stableWidgetPath(path: string): string {
  let p = path.replace(/\/adminer\/?$/i, "").replace(/\/+$/, "");
  p = p.replace(/(\/plugin_widgets\/\d+)\/[^/]+(?=\/iframe)/, "$1");
  p = p.replace(/\/plugin_widgets\/\d+\/iframe/, "/iframe");
  return p;
}

function canonicalSessionKey(raw: string): string {
  return stableWidgetPath(decodeURIComponent(raw));
}

function isCanonicalKey(key: string): boolean {
  return key.startsWith("/organizations/");
}

function isShortToken(key: string): boolean {
  return /^[0-9a-f]{16}$/i.test(key);
}

function widgetKeyFromQueryParams(req: IncomingMessage): string {
  const url = parseRequestUrl(req);
  const org = url.searchParams.get("org")?.trim();
  const project = url.searchParams.get("project")?.trim();
  const env = url.searchParams.get("env")?.trim();
  const component = url.searchParams.get("component")?.trim();
  if (!org || !project || !env || !component) return "";
  return `/organizations/${org}/projects/${project}/environments/${env}/components/${component}/iframe`;
}

function extractIframePath(value: string): string {
  const match = /(\/organizations\/[^\s?#]*\/iframe)/.exec(value);
  if (match) return canonicalSessionKey(match[1]);
  try {
    const path = new URL(value, "http://local").pathname;
    if (path.includes("/iframe")) return canonicalSessionKey(path);
  } catch {
    /* ignore malformed URL */
  }
  return "";
}

function widgetKeyFromRequest(req: IncomingMessage): string {
  const headerNames = [
    "x-forwarded-uri",
    "x-original-url",
    "x-forwarded-path",
    "x-cycloid-plugin-uri",
    "x-request-uri",
    "x-rewrite-url",
  ] as const;
  for (const name of headerNames) {
    const value = req.headers[name];
    if (typeof value !== "string") continue;
    const key = extractIframePath(value);
    if (key) return key;
  }

  for (const value of Object.values(req.headers)) {
    if (typeof value !== "string" || !value.includes("/organizations/")) continue;
    const key = extractIframePath(value);
    if (key) return key;
  }

  const referer = req.headers.referer ?? req.headers.referrer;
  if (typeof referer === "string" && referer) {
    const key = extractIframePath(referer);
    if (key) return key;
  }

  const fromQuery = widgetKeyFromQueryParams(req);
  if (fromQuery) return fromQuery;

  const base = parseCookieHeader(req.headers.cookie).get("cy_adminer_base");
  if (base) return canonicalSessionKey(decodeURIComponent(base));
  return "";
}

function resolveSessionKeyParam(raw: string, req: IncomingMessage): string {
  const decoded = decodeURIComponent(raw).replace(/\/$/, "");
  if (isCanonicalKey(decoded)) return canonicalSessionKey(decoded);

  const mapped = shortSessionKeys.get(decoded);
  if (mapped) {
    if (isCanonicalKey(mapped)) return mapped;
    const fromWidget = widgetKeyFromRequest(req);
    if (fromWidget) {
      shortSessionKeys.set(decoded, fromWidget);
      return fromWidget;
    }
    return mapped;
  }

  const fromWidget = widgetKeyFromRequest(req);
  if (fromWidget) {
    shortSessionKeys.set(decoded, fromWidget);
    return fromWidget;
  }
  return decoded;
}

function normalizeStorageKey(
  key: string,
  req: IncomingMessage,
  publicBasePath: string,
): string {
  if (!key) {
    const fromWidget = widgetKeyFromRequest(req);
    if (fromWidget) return fromWidget;
    if (publicBasePath) return canonicalSessionKey(publicBasePath);
    return "";
  }
  if (isCanonicalKey(key)) return canonicalSessionKey(key);

  if (key.startsWith("sid:")) {
    const fromWidget = widgetKeyFromRequest(req);
    if (fromWidget) return fromWidget;
    if (publicBasePath) return canonicalSessionKey(publicBasePath);
    return "";
  }

  if (isShortToken(key)) {
    const mapped = shortSessionKeys.get(key);
    if (mapped && isCanonicalKey(mapped)) return mapped;
    const fromWidget = widgetKeyFromRequest(req);
    if (fromWidget) {
      shortSessionKeys.set(key, fromWidget);
      return fromWidget;
    }
  }

  if (publicBasePath) return canonicalSessionKey(publicBasePath);
  return key;
}

function publicSessionParam(canonicalKey: string): string {
  if (!isCanonicalKey(canonicalKey)) return canonicalKey;
  for (const [short, full] of shortSessionKeys) {
    if (full === canonicalKey) return short;
  }
  const short = randomBytes(8).toString("hex");
  shortSessionKeys.set(short, canonicalKey);
  return short;
}

function relinkShortTokens(canonicalKey: string, sid?: string): void {
  if (!isCanonicalKey(canonicalKey)) return;
  for (const [short, mapped] of shortSessionKeys) {
    if (mapped === canonicalKey || (sid && mapped === `sid:${sid}`)) {
      shortSessionKeys.set(short, canonicalKey);
    }
  }
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!header) return map;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  }
  return map;
}

function buildCookieHeader(pairs: Map<string, string>): string {
  return [...pairs.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function adminerSessionKey(req: IncomingMessage, search = "", body?: Buffer): string {
  const fromQuery = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("_cy_sk");
  if (fromQuery) return resolveSessionKeyParam(fromQuery, req);

  if (body && body.length > 0) {
    const match = /(?:^|&)_cy_sk=([^&]*)/.exec(body.toString("utf8"));
    if (match) return resolveSessionKeyParam(match[1], req);
  }

  return widgetKeyFromRequest(req);
}

function pruneAdminerSessions(): void {
  const now = Date.now();
  let pruned = false;
  for (const [key, session] of adminerSessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      adminerSessions.delete(key);
      pruned = true;
    }
  }
  if (pruned) persistSessions();
}

function isAdminerCookie(name: string): boolean {
  return name === "adminer_sid" || name === "adminer_key" || name.startsWith("adminer_");
}

function mergeAdminerCookies(existing: string | undefined, stored: string): string {
  const merged = parseCookieHeader(existing);
  for (const [name, value] of parseCookieHeader(stored)) {
    if (isAdminerCookie(name)) merged.set(name, value);
  }
  return buildCookieHeader(merged);
}

function applyStoredAdminerSession(req: IncomingMessage, key: string): boolean {
  if (key && applyStoredAdminerSessionForKey(req, key)) return true;

  const sid = parseCookieHeader(req.headers.cookie).get("adminer_sid");
  if (sid && applyStoredAdminerSessionForKey(req, `sid:${sid}`)) return true;

  return false;
}

function applyStoredAdminerSessionForKey(req: IncomingMessage, key: string): boolean {
  const stored = adminerSessions.get(key);
  if (!stored) return false;
  const merged = mergeAdminerCookies(req.headers.cookie, stored.cookieHeader);
  if (merged) req.headers.cookie = merged;
  return true;
}

function saveAdminerSessionFromCookies(key: string, setCookies: string[]): void {
  const incoming = key ? parseCookieHeader(adminerSessions.get(key)?.cookieHeader) : new Map();
  for (const raw of setCookies) {
    const match = /^([^=]+)=([^;]*)/.exec(raw.trim());
    if (!match) continue;
    const name = match[1].trim();
    if (!isAdminerCookie(name)) continue;
    incoming.set(name, match[2].trim());
  }
  if (!incoming.has("adminer_sid") && !incoming.has("adminer_key")) return;

  const cookieHeader = buildCookieHeader(incoming);
  const entry = { cookieHeader, updatedAt: Date.now() };

  if (key && isCanonicalKey(key)) {
    adminerSessions.set(key, entry);
    const sid = incoming.get("adminer_sid");
    if (sid) adminerSessions.set(`sid:${sid}`, entry);
    relinkShortTokens(key, sid);
    persistSessions();
    return;
  }

  if (key && !key.startsWith("sid:")) adminerSessions.set(key, entry);
  const sid = incoming.get("adminer_sid");
  if (sid) adminerSessions.set(`sid:${sid}`, entry);
  persistSessions();
}

/** Map Adminer Location (relative or absolute) to upstream path on 127.0.0.1. */
function locationToAdminerPath(location: string): string {
  let pathAndQuery = location.trim();
  if (!pathAndQuery || pathAndQuery === ".") return "/";

  if (/^https?:\/\//i.test(pathAndQuery)) {
    try {
      const parsed = new URL(pathAndQuery);
      pathAndQuery = `${parsed.pathname}${parsed.search}`;
    } catch {
      return "/";
    }
  }

  if (pathAndQuery.startsWith("./")) pathAndQuery = pathAndQuery.slice(2);
  if (pathAndQuery.startsWith("?")) pathAndQuery = `/${pathAndQuery}`;

  const qIdx = pathAndQuery.indexOf("?");
  const pathPart = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
  const query = qIdx >= 0 ? pathAndQuery.slice(qIdx) : "";

  let adminerPath = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  adminerPath = toAdminerPath(adminerPath);
  return `${adminerPath}${query}`;
}

function injectAdminerSessionHeaders(headers: Record<string, string>, sessionKey: string, req: IncomingMessage): void {
  let stored = sessionKey ? adminerSessions.get(sessionKey) : undefined;
  if (!stored) {
    const sid = parseCookieHeader(headers.cookie).get("adminer_sid");
    if (sid) stored = adminerSessions.get(`sid:${sid}`);
  }
  if (!stored) return;
  const pairs = parseCookieHeader(stored.cookieHeader);
  const sid = pairs.get("adminer_sid");
  const key = pairs.get("adminer_key");
  if (sid) headers["x-cy-adminer-sid"] = sid;
  if (key) headers["x-cy-adminer-key"] = key;
}

function buildUpstreamHeaders(
  req: IncomingMessage,
  sessionKey: string,
  body: Buffer | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || key === "host") continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers.host = `127.0.0.1:${ADMINER_PORT}`;
  applyStoredAdminerSession(req, sessionKey);
  if (req.headers.cookie) headers.cookie = String(req.headers.cookie);
  injectAdminerSessionHeaders(headers, sessionKey, req);
  rememberOutgoingAdminerCookies(sessionKey, headers.cookie);
  if (body !== undefined) headers["content-length"] = String(body.length);
  return headers;
}

function rememberOutgoingAdminerCookies(key: string, cookieHeader: string | undefined): void {
  if (!key || !cookieHeader) return;
  const pairs = parseCookieHeader(cookieHeader);
  const adminer = [...pairs.entries()].filter(([name]) => isAdminerCookie(name));
  if (adminer.length === 0) return;
  saveAdminerSessionFromCookies(key, adminer.map(([name, value]) => `${name}=${value}`));
}

function collectSetCookies(headers: IncomingHttpHeaders): string[] {
  const value = headers["set-cookie"];
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function resolveSessionKey(
  req: IncomingMessage,
  search: string,
  body: Buffer | undefined,
  publicBasePath: string,
): string {
  const raw = adminerSessionKey(req, search, body);
  return normalizeStorageKey(raw, req, publicBasePath);
}

function requestOrigin(req: IncomingMessage): string {
  const proto = String(req.headers["x-forwarded-proto"] ?? "https").split(",")[0].trim() || "https";
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function appendSessionKeyToPath(pathAndQuery: string, sessionKey: string, origin?: string): string {
  const param = sessionKey ? publicSessionParam(sessionKey) : "";
  if (!param || pathAndQuery.includes("_cy_sk=")) {
    return origin && pathAndQuery.startsWith("/") ? `${origin}${pathAndQuery}` : pathAndQuery;
  }
  const q = pathAndQuery.indexOf("?");
  const path = q >= 0 ? pathAndQuery.slice(0, q) : pathAndQuery;
  const query = q >= 0 ? pathAndQuery.slice(q + 1) : "";
  const params = new URLSearchParams(query);
  params.set("_cy_sk", param);
  const qs = params.toString();
  const result = qs ? `${path}?${qs}` : path;
  return origin && path.startsWith("/") ? `${origin}${result}` : result;
}

function hasAdminerCookie(header: string | undefined): boolean {
  return /(?:^|;\s*)adminer_sid=/.test(header ?? "");
}

function stripExternalVersionCheck(html: string): string {
  return html.replace(/https?:\/\/www\.adminer\.org\/version\/?[^"']*/gi, "about:blank");
}

function stripCySessionFromBody(body: Buffer): Buffer {
  const text = body.toString("utf8");
  const cleaned = text
    .replace(/(^|&)_cy_sk=[^&]*/g, "")
    .replace(/^&/, "")
    .replace(/&&/g, "&");
  return Buffer.from(cleaned, "utf8");
}

const PROXY_QUERY_PARAMS = new Set(["_cy_sk", "org", "project", "env", "component", "secret"]);

function stripPluginQueryParams(search: string): string {
  if (!search) return "";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of PROXY_QUERY_PARAMS) params.delete(key);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const STRIPPED_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "host",
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

/** Client fixes: rewrite forms/links; add _cy_sk to URL via replaceState (never full reload). */
const IFRAME_CLIENT_SCRIPT = `<script>(function(){
function stablePath(p){p=p.replace(/\\/adminer\\/?$/,"").replace(/\\/+$/,"");p=p.replace(/(\\/plugin_widgets\\/\\d+)\\/[^/]+(?=\\/iframe)/,"$1");return p.replace(/\\/plugin_widgets\\/\\d+\\/iframe/,"/iframe")}
function canonicalKey(){var p=location.pathname;return p.indexOf("/iframe")<0?"":stablePath(p)}
function iframePrefix(){var p=location.pathname;return p.indexOf("/iframe")<0?"":p.replace(/\\/adminer\\/?$/,"").replace(/\\/+$/,"")}
function urlSk(){try{return new URL(location.href).searchParams.get("_cy_sk")||""}catch(e){return""}}
var ck=canonicalKey();
function effectiveSk(){return urlSk()||ck}
function setSkInUrl(sk){if(!sk)return;try{var u=new URL(location.href);if(u.searchParams.get("_cy_sk")===sk)return;u.searchParams.set("_cy_sk",sk);history.replaceState(null,"",u.pathname+u.search+u.hash)}catch(e){}}
setSkInUrl(effectiveSk());
function baseDir(){var k=iframePrefix();return k?location.origin+k+"/":null}
function fixUrl(u){var b=baseDir();if(!b||!u)return u;if(/^https?:\\/\\//i.test(u)||u.indexOf("//")===0)return u;if(u.charAt(0)==="/")return b.replace(/\\/$/,"")+u;if(u.charAt(0)==="?")return b.replace(/\\/?$/,"/")+u;return u}
function withSk(u){var k=effectiveSk();if(!k||!u)return u;try{var n=new URL(u,location.href);if(n.origin!==location.origin)return u;n.searchParams.set("_cy_sk",k);return n.pathname+n.search+n.hash}catch(e){return u}}
var b=baseDir();
if(b&&!document.querySelector("base")){var base=document.createElement("base");base.href=b;(document.head||document.documentElement).prepend(base)}
function patch(){
  document.querySelectorAll("a[href]").forEach(function(el){
    var h=el.getAttribute("href");
    if(!h)return;
    if(h.charAt(0)==="/"||h.charAt(0)==="?")el.setAttribute("href",withSk(fixUrl(h)));
  });
  document.querySelectorAll('form[action^="/"],form:not([action])').forEach(function(el){
    var a=el.getAttribute("action");
    if(!a||a==="/")el.setAttribute("action",withSk(fixUrl(a||"/")));
    else if(a.charAt(0)==="/")el.setAttribute("action",withSk(fixUrl(a)));
    var sk=effectiveSk();
    if(sk&&!el.querySelector('input[name="_cy_sk"]')){var i=document.createElement("input");i.type="hidden";i.name="_cy_sk";i.value=sk;el.appendChild(i)}
  });
}
patch();
new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("submit",function(e){
  var f=e.target;if(!f||f.nodeName!=="FORM")return;
  var act=f.getAttribute("action");
  if(!act||act==="/")f.setAttribute("action",withSk(fixUrl(act||"/")));
  else if(act.charAt(0)==="/")f.setAttribute("action",withSk(fixUrl(act)));
  var sk=effectiveSk();
  if(sk&&!f.querySelector('input[name="_cy_sk"]')){var i=document.createElement("input");i.type="hidden";i.name="_cy_sk";i.value=sk;f.appendChild(i)}
},true);
var of=window.fetch;
window.fetch=function(input,init){try{var url=typeof input==="string"?input:input.url;if(url&&url.indexOf("adminer.org")>=0)return Promise.resolve(new Response("{}",{status:200,headers:{"content-type":"application/json"}}))}catch(e){}return of.apply(this,arguments)};
})();</script>`;

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
  const iframeIdx = pathname.indexOf("/iframe");
  if (iframeIdx >= 0) {
    const rest = pathname.slice(iframeIdx + "/iframe".length);
    if (!rest || rest === "/") return "/";
    return normalizeSlashes(rest.startsWith("/") ? rest : `/${rest}`);
  }
  return normalizeSlashes(pathname || "/");
}

function resolvePathname(url: URL, rawPathname: string): string {
  const proxyPath = url.searchParams.get("path")?.trim();
  if (proxyPath) {
    const normalized = proxyPath.startsWith("/") ? proxyPath : `/${proxyPath}`;
    return normalizeSlashes(normalized.replace(/\/$/, "") || "/");
  }
  return normalizePluginPath(rawPathname);
}

function iframeBaseFromPathname(pathname: string): string {
  const iframeIdx = pathname.indexOf("/iframe");
  if (iframeIdx < 0) return "";
  const prefix = pathname.slice(0, iframeIdx + "/iframe".length);
  return prefix;
}

function toAdminerPath(pluginPath: string): string {
  if (pluginPath === ADMINER_MOUNT || pluginPath === `${ADMINER_MOUNT}/`) return "/";
  if (pluginPath.startsWith(`${ADMINER_MOUNT}/`)) {
    return pluginPath.slice(ADMINER_MOUNT.length) || "/";
  }
  return pluginPath;
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

/** Rewrite Adminer redirect targets so the browser stays on the Cycloid proxy path with _cy_sk. */
function rewriteLocation(
  location: string,
  publicBasePath: string,
  sessionKey: string,
  origin: string,
): string {
  if (!publicBasePath) return location;

  const trimmed = location.trim();
  if (!trimmed) return appendSessionKeyToPath(publicBasePath, sessionKey, origin);

  let pathAndQuery = trimmed;
  let hash = "";
  const hashIdx = pathAndQuery.indexOf("#");
  if (hashIdx >= 0) {
    hash = pathAndQuery.slice(hashIdx);
    pathAndQuery = pathAndQuery.slice(0, hashIdx);
  }

  if (/^https?:\/\//i.test(pathAndQuery)) {
    try {
      const parsed = new URL(pathAndQuery);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      } else if (iframeBaseFromPathname(parsed.pathname)) {
        return appendSessionKeyToPath(`${parsed.pathname}${parsed.search}`, sessionKey, origin) + hash;
      } else {
        pathAndQuery = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return location;
    }
  }

  if (pathAndQuery.startsWith(publicBasePath)) {
    return appendSessionKeyToPath(pathAndQuery, sessionKey, origin) + hash;
  }

  if (pathAndQuery.startsWith("?")) {
    return appendSessionKeyToPath(`${publicBasePath}${pathAndQuery}`, sessionKey, origin) + hash;
  }

  if (pathAndQuery.startsWith("./")) {
    pathAndQuery = pathAndQuery.slice(2);
  } else if (pathAndQuery === ".") {
    pathAndQuery = "";
  }

  if (pathAndQuery.startsWith("/")) {
    const qIdx = pathAndQuery.indexOf("?");
    const pathPart = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
    const query = qIdx >= 0 ? pathAndQuery.slice(qIdx) : "";
    let mapped = publicBasePath;
    if (pathPart !== "/" && pathPart !== "") {
      if (pathPart === ADMINER_MOUNT || pathPart === `${ADMINER_MOUNT}/`) {
        mapped = publicBasePath;
      } else if (pathPart.startsWith(`${ADMINER_MOUNT}/`)) {
        mapped = `${publicBasePath}${pathPart.slice(ADMINER_MOUNT.length)}`;
      } else {
        mapped = `${publicBasePath}${pathPart}`;
      }
    }
    return appendSessionKeyToPath(`${mapped}${query}`, sessionKey, origin) + hash;
  }

  const mapped = pathAndQuery ? `${publicBasePath}/${pathAndQuery}`.replace(/\/\/+/g, "/") : publicBasePath;
  return appendSessionKeyToPath(mapped, sessionKey, origin) + hash;
}

function rewriteSetCookie(cookie: string, _publicBasePath: string): string {
  const nameValue = cookie.trim().split(";")[0]?.trim() ?? cookie.trim();
  if (!nameValue.includes("=")) return cookie;
  const attrs = ["Path=/", "SameSite=None", "Secure"];
  if (/httponly/i.test(cookie)) attrs.push("HttpOnly");
  return `${nameValue}; ${attrs.join("; ")}`;
}

function buildCyAdminerBaseCookie(publicBasePath: string): string {
  return `cy_adminer_base=${encodeURIComponent(publicBasePath)}; Path=/; SameSite=None; Secure; HttpOnly`;
}

function filterProxyResponseHeaders(
  headers: IncomingHttpHeaders,
  publicBasePath: string,
  sessionKey: string,
  origin: string,
  opts: { stripLocation?: boolean } = {},
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  let rewrittenLocation = "";
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || STRIPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (lower === "location") {
      if (opts.stripLocation) continue;
      if (typeof value === "string") {
        rewrittenLocation = rewriteLocation(value, publicBasePath, sessionKey, origin);
        out[key] = rewrittenLocation;
      }
      continue;
    }
    if (lower === "set-cookie") {
      const cookies = Array.isArray(value) ? value : [value];
      out[key] = cookies.map((cookie) => rewriteSetCookie(String(cookie), publicBasePath));
      continue;
    }
    out[key] = value;
  }

  const baseForCookie = publicBasePath || (isCanonicalKey(sessionKey) ? sessionKey : "");
  if (baseForCookie) {
    const existing = out["set-cookie"];
    const baseCookie = buildCyAdminerBaseCookie(baseForCookie);
    out["set-cookie"] = existing
      ? [...(Array.isArray(existing) ? existing : [existing]), baseCookie]
      : baseCookie;
  }

  if (rewrittenLocation) {
    out["x-cy-adminer-redirect"] = rewrittenLocation;
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

function injectIframeFixes(
  html: string,
  publicBase: { href: string; path: string },
  sessionKey: string,
  requestMethod: string,
): string {
  if (!html.includes("<")) return html;

  let out = stripExternalVersionCheck(html);
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

  const skParam = sessionKey ? publicSessionParam(sessionKey) : "";
  const isGet = requestMethod.toUpperCase() === "GET";
  const skScript =
    isGet && skParam
      ? `<script>(function(){var s="${skParam}";try{var u=new URL(location.href);var k=u.searchParams.get("_cy_sk");if(k===s)return;if(!k||k.charAt(0)==="/"){u.searchParams.set("_cy_sk",s);history.replaceState(null,"",u.pathname+u.search+u.hash)}}catch(e){}})();</script>`
      : "";

  const script = skScript + IFRAME_CLIENT_SCRIPT;
  if (/<head[\s>]/i.test(out)) {
    return out.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${script}`);
  }
  return `${script}${out}`;
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer | undefined> {
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

type AdminerProxyContext = {
  req: IncomingMessage;
  res: ServerResponse;
  publicBase: { href: string; path: string };
  sessionKey: string;
  origin: string;
  bridged: boolean;
  redirectCount: number;
  requestMethod: string;
  seenRedirectPaths?: Set<string>;
};

function respondAdminerUpstream(
  ctx: AdminerProxyContext,
  upstreamRes: IncomingMessage,
  internalizedRedirect: boolean,
): void {
  saveAdminerSessionFromCookies(ctx.sessionKey, collectSetCookies(upstreamRes.headers));

  const contentType = String(upstreamRes.headers["content-type"] ?? "");
  const isHtml = contentType.includes("text/html");
  const responseHeaders = filterProxyResponseHeaders(
    upstreamRes.headers,
    ctx.publicBase.path,
    ctx.sessionKey,
    ctx.origin,
    { stripLocation: internalizedRedirect },
  );
  const stored = ctx.sessionKey ? adminerSessions.get(ctx.sessionKey) : undefined;
  const cookieNames = stored ? [...parseCookieHeader(stored.cookieHeader).keys()].join(",") : "-";
  responseHeaders["x-cy-adminer-debug"] =
    `${ctx.sessionKey || "-"}|${isCanonicalKey(ctx.sessionKey) ? publicSessionParam(ctx.sessionKey) : "-"}|bridged=${ctx.bridged}|stored=${Boolean(stored)}|cookies=${cookieNames}|redirects=${ctx.redirectCount}`;

  const statusCode =
    internalizedRedirect && (upstreamRes.statusCode ?? 0) >= 300 && (upstreamRes.statusCode ?? 0) < 400
      ? 200
      : (upstreamRes.statusCode ?? 502);

  if (!isHtml) {
    delete responseHeaders["content-length"];
    ctx.res.writeHead(statusCode, responseHeaders);
    upstreamRes.pipe(ctx.res);
    return;
  }

  const chunks: Buffer[] = [];
  upstreamRes.on("data", (chunk: Buffer) => chunks.push(chunk));
  upstreamRes.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = Buffer.from(
      injectIframeFixes(raw, ctx.publicBase, ctx.sessionKey, ctx.requestMethod),
      "utf8",
    );
    responseHeaders["content-length"] = String(body.length);
    ctx.res.writeHead(statusCode, responseHeaders);
    ctx.res.end(body);
  });
}

function dispatchAdminerRequest(
  ctx: AdminerProxyContext,
  method: string,
  targetPath: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
): void {
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: Number(ADMINER_PORT),
      path: targetPath,
      method,
      headers,
    },
    (upstreamRes) => {
      saveAdminerSessionFromCookies(ctx.sessionKey, collectSetCookies(upstreamRes.headers));

      const status = upstreamRes.statusCode ?? 502;
      const location = upstreamRes.headers.location;
      const canFollow =
        status >= 300 &&
        status < 400 &&
        typeof location === "string" &&
        ctx.redirectCount < MAX_INTERNAL_REDIRECTS;

      if (canFollow) {
        upstreamRes.resume();
        const followPath = locationToAdminerPath(location);
        const seen = ctx.seenRedirectPaths ?? new Set<string>();
        if (seen.has(followPath)) {
          console.log(`[WARN] adminer redirect loop detected at ${followPath}`);
          return respondAdminerUpstream(ctx, upstreamRes, ctx.redirectCount > 0);
        }
        seen.add(followPath);
        applyStoredAdminerSession(ctx.req, ctx.sessionKey);

        console.log(
          `[INFO] adminer internal redirect ${ctx.redirectCount + 1} ${location} → ${followPath}`,
        );

        return dispatchAdminerRequest(
          { ...ctx, redirectCount: ctx.redirectCount + 1, seenRedirectPaths: seen },
          "GET",
          followPath,
          buildUpstreamHeaders(ctx.req, ctx.sessionKey, undefined),
          undefined,
        );
      }

      respondAdminerUpstream(ctx, upstreamRes, ctx.redirectCount > 0);
    },
  );

  upstream.on("error", (err) => {
    ctx.res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    ctx.res.end(`Adminer unavailable: ${(err as Error).message}`);
  });

  if (body !== undefined) upstream.write(body);
  upstream.end();
}

function proxyAdminer(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  search: string,
  requestUrl: URL,
  body: Buffer | undefined,
): void {
  const adminerPath = toAdminerPath(pathname);
  const targetPath = `${adminerPath}${stripPluginQueryParams(search)}`;
  const publicBase = getPublicBase(req, requestUrl);
  const sessionKey = resolveSessionKey(req, search, body, publicBase.path);
  pruneAdminerSessions();
  const bridged = applyStoredAdminerSession(req, sessionKey);
  const upstreamBody = body !== undefined ? stripCySessionFromBody(body) : undefined;
  const headers = buildUpstreamHeaders(req, sessionKey, upstreamBody);

  console.log(
    `[INFO] adminer session key=${sessionKey || "(none)"} cookie=${hasAdminerCookie(headers.cookie) ? "yes" : "no"} bridged=${bridged}`,
  );

  dispatchAdminerRequest(
    {
      req,
      res,
      publicBase,
      sessionKey,
      origin: requestOrigin(req),
      bridged,
      redirectCount: 0,
      requestMethod: req.method ?? "GET",
    },
    req.method ?? "GET",
    targetPath,
    headers,
    upstreamBody,
  );
}

const server = createServer(async (req, res) => {
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

  if (method === "GET" && (pathname === "/_cy/session-debug" || pathname === `${ADMINER_MOUNT}/_cy/session-debug`)) {
    const publicBase = getPublicBase(req, url);
    const sessionKey = resolveSessionKey(req, url.search, undefined, publicBase.path);
    return sendJson(res, 200, {
      sessionKey: sessionKey || null,
      sessionParam: sessionKey ? publicSessionParam(sessionKey) : null,
      incomingCookie: req.headers.cookie ?? null,
      storedCookie: sessionKey ? adminerSessions.get(sessionKey)?.cookieHeader ?? null : null,
      hasStoredSession: sessionKey ? adminerSessions.has(sessionKey) : false,
      storedSessionCount: adminerSessions.size,
      referer: req.headers.referer ?? req.headers.referrer ?? null,
      query: url.search || null,
      proxyContext: {
        org: url.searchParams.get("org"),
        project: url.searchParams.get("project"),
        env: url.searchParams.get("env"),
        component: url.searchParams.get("component"),
      },
      widgetKeyFromQuery: widgetKeyFromQueryParams(req) || null,
    });
  }

  const body = await readRequestBody(req);
  proxyAdminer(req, res, pathname, url.search, url, body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[INFO] listening on http://0.0.0.0:${port} (adminer on 127.0.0.1:${ADMINER_PORT})`);
});
