const { app, BrowserWindow, dialog, shell } = require("electron");
const { createReadStream, existsSync, statSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, join, normalize, resolve, sep } = require("node:path");

const appRoot = resolve(__dirname, "..");
let staticServer = null;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".webp": "image/webp"
};

function isInsideRoot(target) {
  return target === appRoot || target.startsWith(`${appRoot}${sep}`);
}

function resolveStaticPath(url = "/") {
  let cleanUrl;
  try {
    cleanUrl = decodeURIComponent(url.split("?")[0]);
  } catch {
    return null;
  }

  const requested = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const target = normalize(join(appRoot, requested));
  if (!isInsideRoot(target) || !existsSync(target)) return null;

  const stats = statSync(target);
  if (stats.isDirectory()) {
    const indexFile = join(target, "index.html");
    if (!existsSync(indexFile) || !statSync(indexFile).isFile()) return null;
    return indexFile;
  }

  return stats.isFile() ? target : null;
}

function desktopConfigScript() {
  const apiBaseUrl = process.env.VPBUDDY_API_BASE_URL || "http://47.100.182.3:28765";
  return [
    `window.VPBUDDY_API_BASE_URL = ${JSON.stringify(apiBaseUrl)};`,
    "window.VPBUDDY_DESKTOP = true;"
  ].join("\n");
}

function startStaticServer() {
  return new Promise((resolveServer, rejectServer) => {
    const server = createServer((req, res) => {
      const reqUrl = req.url || "/";

      if (reqUrl.split("?")[0] === "/desktop-config.js") {
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(desktopConfigScript());
        return;
      }

      const file = resolveStaticPath(reqUrl);
      if (!file) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });

      const stream = createReadStream(file);
      stream.on("error", () => {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        }
        res.end("Server error");
      });
      stream.pipe(res);
    });

    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      staticServer = server;
      const address = server.address();
      resolveServer(`http://127.0.0.1:${address.port}/index.html`);
    });
  });
}

function createMainWindow(url) {
  const win = new BrowserWindow({
    title: "VPBuddy",
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#020b1a",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once("ready-to-show", () => {
    win.show();
    if (process.env.VPBUDDY_DESKTOP_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  });

  win.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    shell.openExternal(nextUrl);
    return { action: "deny" };
  });

  win.loadURL(url);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    try {
      const url = await startStaticServer();
      createMainWindow(url);
    } catch (error) {
      dialog.showErrorBox("VPBuddy failed to start", error?.message || String(error));
      app.quit();
    }

    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const url = staticServer
          ? `http://127.0.0.1:${staticServer.address().port}/index.html`
          : await startStaticServer();
        createMainWindow(url);
      }
    });
  });

  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (staticServer) {
      staticServer.close();
      staticServer = null;
    }
  });
}
