import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import httpProxy from "http-proxy";

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = dirname(modulePath);
const defaultBackendUrl = "http://47.100.182.3:28765";
const webProxyMount = "/vpbuddy";
const backendProxyPrefixes = ["/api", "/meetings", "/docs"];
const staticPrefixes = [
  "/src/",
  "/assets/",
  "/node_modules/html2canvas/",
  "/node_modules/pdfjs-dist/"
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
  ".bcmap": "application/octet-stream"
};

function normalizeBaseUrl(value, fallback = "") {
  const normalized = String(value || fallback).trim().replace(/\/$/, "");
  if (!normalized) return "";
  const parsed = new URL(normalized);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("VPBuddy API base URL must use HTTP or HTTPS.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function isInsideRoot(root, target) {
  return target === root || target.startsWith(`${root}${sep}`);
}

export function isProxyPath(pathname = "") {
  if (pathname !== webProxyMount && !pathname.startsWith(`${webProxyMount}/`)) return false;
  const backendPath = pathname.slice(webProxyMount.length) || "/";
  return backendProxyPrefixes.some((prefix) => backendPath === prefix || backendPath.startsWith(`${prefix}/`));
}

function stripWebProxyMount(req) {
  const rawUrl = String(req.url || "/");
  const queryIndex = rawUrl.indexOf("?");
  const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : "";
  req.url = `${pathname.slice(webProxyMount.length) || "/"}${query}`;
}

function isAllowedStaticPath(pathname) {
  return pathname === "/index.html"
    || pathname === "/favicon.svg"
    || staticPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function requestPath(reqUrl = "/") {
  try {
    return new URL(reqUrl, "http://vpbuddy.local").pathname;
  } catch {
    return "";
  }
}

function resolveStaticPath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!isAllowedStaticPath(decoded)) return null;

  const relative = decoded.replace(/^\/+/, "");
  const target = resolve(root, relative);
  if (!isInsideRoot(root, target) || !existsSync(target)) return null;
  const stats = statSync(target);
  return stats.isFile() ? target : null;
}

function setWebHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "microphone=(self), camera=(), geolocation=()");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  setWebHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function runtimeConfigScript(publicApiBaseUrl) {
  const runtimeApiExpression = publicApiBaseUrl
    ? JSON.stringify(publicApiBaseUrl)
    : `window.location.origin + ${JSON.stringify(webProxyMount)}`;
  return [
    `window.VPBUDDY_RUNTIME_API_BASE_URL = ${runtimeApiExpression};`,
    "window.VPBUDDY_API_BASE_URL = window.VPBUDDY_RUNTIME_API_BASE_URL;",
    "window.VPBUDDY_API_BASE_LOCKED = true;",
    "window.VPBUDDY_DESKTOP = false;",
    "window.VPBUDDY_WEB = true;"
  ].join("\n");
}

function sendRuntimeConfig(res, publicApiBaseUrl) {
  setWebHeaders(res);
  res.writeHead(200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store, max-age=0"
  });
  res.end(runtimeConfigScript(publicApiBaseUrl));
}

function sendStaticFile(req, res, file) {
  setWebHeaders(res);
  res.writeHead(200, {
    "Content-Type": mime[extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store, max-age=0"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }

  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) sendJson(res, 500, { error: "Static asset read failed" });
    else res.destroy();
  });
  stream.pipe(res);
}

function writeUpgradeError(socket, statusCode, message) {
  if (!socket?.writable) return;
  const body = JSON.stringify({ error: message });
  socket.end([
    `HTTP/1.1 ${statusCode} ${statusCode === 502 ? "Bad Gateway" : "Not Found"}`,
    "Content-Type: application/json; charset=utf-8",
    `Content-Length: ${Buffer.byteLength(body)}`,
    "Connection: close",
    "",
    body
  ].join("\r\n"));
}

export function createVpbuddyWebServer({
  root = defaultRoot,
  backendUrl = process.env.VPBUDDY_API_BASE_URL || defaultBackendUrl,
  publicApiBaseUrl = process.env.VPBUDDY_PUBLIC_API_BASE_URL || "",
  logger = console
} = {}) {
  const staticRoot = resolve(root);
  const upstream = normalizeBaseUrl(backendUrl, defaultBackendUrl);
  const publicBase = publicApiBaseUrl ? normalizeBaseUrl(publicApiBaseUrl) : "";
  const proxy = httpProxy.createProxyServer({
    target: upstream,
    changeOrigin: true,
    xfwd: true,
    ws: true,
    secure: upstream.startsWith("https://"),
    proxyTimeout: 0,
    timeout: 0
  });

  proxy.on("proxyRes", (proxyRes) => {
    const contentType = String(proxyRes.headers["content-type"] || "").toLowerCase();
    if (contentType.includes("text/event-stream")) {
      proxyRes.headers["cache-control"] = "no-cache, no-transform";
      proxyRes.headers["x-accel-buffering"] = "no";
    }
  });

  proxy.on("error", (error, req, responseOrSocket) => {
    logger.error?.(`[VPBuddy web proxy] ${req?.method || "WS"} ${req?.url || ""}: ${error?.message || error}`);
    if (typeof responseOrSocket?.writeHead === "function") {
      sendJson(responseOrSocket, 502, {
        error: "VPBuddy backend is unavailable",
        code: "VPBUDDY_BACKEND_UNAVAILABLE"
      });
      return;
    }
    writeUpgradeError(responseOrSocket, 502, "VPBuddy backend is unavailable");
  });

  const server = createServer((req, res) => {
    const pathname = requestPath(req.url);
    if (!pathname) {
      sendJson(res, 400, { error: "Invalid request path" });
      return;
    }

    if (isProxyPath(pathname)) {
      stripWebProxyMount(req);
      proxy.web(req, res);
      return;
    }

    if (pathname === "/healthz") {
      sendJson(res, 200, {
        status: "ok",
        service: "vpbuddy-web"
      });
      return;
    }

    if (pathname === "/desktop-config.js") {
      sendRuntimeConfig(res, publicBase);
      return;
    }

    const normalizedPath = pathname === "/" ? "/index.html" : pathname;
    let file = resolveStaticPath(staticRoot, normalizedPath);
    if (!file && req.method === "GET" && !extname(pathname) && String(req.headers.accept || "").includes("text/html")) {
      file = resolveStaticPath(staticRoot, "/index.html");
    }
    if (!file) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }
    sendStaticFile(req, res, file);
  });

  server.on("upgrade", (req, socket, head) => {
    const pathname = requestPath(req.url);
    if (!pathname || !isProxyPath(pathname)) {
      writeUpgradeError(socket, 404, "WebSocket route not found");
      return;
    }
    stripWebProxyMount(req);
    proxy.ws(req, socket, head);
  });

  server.requestTimeout = 0;
  server.keepAliveTimeout = 65_000;

  return {
    server,
    proxy,
    backendUrl: upstream,
    publicApiBaseUrl: publicBase,
    close: () => new Promise((resolveClose, rejectClose) => {
      proxy.close();
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    })
  };
}

export async function startVpbuddyWebServer({
  port = Number.parseInt(process.env.PORT || "4173", 10),
  host = process.env.HOST || "0.0.0.0",
  ...options
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new TypeError("PORT must be an integer between 0 and 65535.");
  }

  const app = createVpbuddyWebServer(options);
  await new Promise((resolveListen, rejectListen) => {
    app.server.once("error", rejectListen);
    app.server.listen(port, host, () => {
      app.server.off("error", rejectListen);
      resolveListen();
    });
  });
  return app;
}

async function run() {
  const app = await startVpbuddyWebServer();
  const address = app.server.address();
  const displayHost = typeof address === "object" && address?.address === "0.0.0.0"
    ? "127.0.0.1"
    : address?.address || "127.0.0.1";
  loggerLine(`VPBuddy web running at http://${displayHost}:${address?.port || process.env.PORT || 4173}`);
  loggerLine(`VPBuddy backend proxy: ${app.backendUrl}`);

  const shutdown = async () => {
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function loggerLine(message) {
  console.log(message);
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
