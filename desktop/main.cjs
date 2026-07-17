const { app, BrowserWindow, dialog, screen, shell } = require("electron");
const { createReadStream, existsSync, statSync } = require("node:fs");
const { createServer } = require("node:http");
const { extname, join, normalize, resolve, sep } = require("node:path");
const { calculateDesktopZoom, calculateWindowGeometry } = require("./display-scale.cjs");

const appRoot = resolve(__dirname, "..");
let staticServer = null;
const WINDOW_REVEAL_TIMEOUT_MS = 3000;

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

function activeDisplayForWindow(win) {
  try {
    return screen.getDisplayMatching(win.getBounds());
  } catch {
    return screen.getPrimaryDisplay();
  }
}

function rendererDisplayMetrics(win) {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return Promise.resolve(null);

  return win.webContents.executeJavaScript(`(() => ({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight
    }
  }))()`, true).catch(() => null);
}

function closestTo(value, alternatives) {
  return alternatives.reduce((closest, candidate) => (
    Math.abs(candidate - value) < Math.abs(closest - value) ? candidate : closest
  ));
}

function baselineRendererMetrics(contentSize, rendererMetrics, currentZoom, displayScaleFactor) {
  const nativeWidth = Number(contentSize[0]);
  const nativeHeight = Number(contentSize[1]);
  const rendererWidth = Number(rendererMetrics?.viewport?.width) * currentZoom;
  const rendererHeight = Number(rendererMetrics?.viewport?.height) * currentZoom;

  const chooseViewportDimension = (rendererValue, nativeValue) => {
    if (!Number.isFinite(rendererValue) || rendererValue <= 0) return nativeValue;
    const ratio = rendererValue / nativeValue;
    return ratio >= 0.9 && ratio <= 1.1 ? rendererValue : nativeValue;
  };

  const rawDevicePixelRatio = Number(rendererMetrics?.devicePixelRatio);
  const displayScale = Number.isFinite(displayScaleFactor) && displayScaleFactor > 0
    ? displayScaleFactor
    : 1;
  const devicePixelRatio = Number.isFinite(rawDevicePixelRatio) && rawDevicePixelRatio > 0
    ? closestTo(displayScale, [rawDevicePixelRatio, rawDevicePixelRatio / currentZoom])
    : displayScale;

  return {
    viewportWidth: chooseViewportDimension(rendererWidth, nativeWidth),
    viewportHeight: chooseViewportDimension(rendererHeight, nativeHeight),
    devicePixelRatio
  };
}

function constrainWindowToDisplay(win, display) {
  if (!display) return;

  const geometry = calculateWindowGeometry(display);
  win.setMinimumSize(geometry.minWidth, geometry.minHeight);
  if (win.isMaximized() || win.isFullScreen()) return;

  const workArea = display.workArea || {
    x: 0,
    y: 0,
    width: display.workAreaSize?.width,
    height: display.workAreaSize?.height
  };
  if (!Number.isFinite(workArea.width) || !Number.isFinite(workArea.height)) return;

  const bounds = win.getBounds();
  const width = bounds.width > workArea.width
    ? Math.min(bounds.width, Math.floor(workArea.width * 0.96))
    : bounds.width;
  const height = bounds.height > workArea.height
    ? Math.min(bounds.height, Math.floor(workArea.height * 0.96))
    : bounds.height;
  const x = Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width);
  const y = Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height);
  const nextBounds = { x, y, width, height };

  if (Object.keys(nextBounds).some((key) => nextBounds[key] !== bounds[key])) {
    win.setBounds(nextBounds);
  }
}

async function applyDesktopDisplayScale(win, reason, diagnosticState) {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return;

  const revision = ++diagnosticState.revision;
  const display = activeDisplayForWindow(win);
  constrainWindowToDisplay(win, display);
  const currentZoom = win.webContents.getZoomFactor();
  const contentSize = win.getContentSize();
  const rendererMetrics = await rendererDisplayMetrics(win);
  if (revision !== diagnosticState.revision || win.isDestroyed()) return;

  const baseline = baselineRendererMetrics(
    contentSize,
    rendererMetrics,
    currentZoom,
    display?.scaleFactor
  );
  const zoom = calculateDesktopZoom({
    viewportWidth: baseline.viewportWidth,
    viewportHeight: baseline.viewportHeight,
    displayScaleFactor: display?.scaleFactor || baseline.devicePixelRatio,
    platform: process.platform,
    zoomOverride: process.env.VPBUDDY_DESKTOP_ZOOM_FACTOR
  });

  if (Math.abs(currentZoom - zoom.zoomFactor) > 0.001) {
    win.webContents.setZoomFactor(zoom.zoomFactor);
  }

  const diagnostics = {
    reason,
    platform: process.platform,
    display: {
      id: display?.id,
      label: display?.label || "",
      bounds: display?.bounds,
      workArea: display?.workArea,
      scaleFactor: display?.scaleFactor || baseline.devicePixelRatio,
      systemScalePercent: Math.round((display?.scaleFactor || baseline.devicePixelRatio) * 100)
    },
    window: {
      bounds: win.getBounds(),
      contentSize: { width: contentSize[0], height: contentSize[1] }
    },
    renderer: {
      ...rendererMetrics,
      baselineDevicePixelRatio: Math.round(baseline.devicePixelRatio * 1000) / 1000,
      viewportAtZoomFactorOne: {
        width: Math.round(baseline.viewportWidth),
        height: Math.round(baseline.viewportHeight)
      }
    },
    zoom
  };

  if (zoom.override.status === "invalid" && !diagnosticState.warnedInvalidOverride) {
    diagnosticState.warnedInvalidOverride = true;
    console.warn(
      `[VPBuddy display-scale] Ignoring invalid VPBUDDY_DESKTOP_ZOOM_FACTOR=${JSON.stringify(zoom.override.raw)}`
    );
  }

  const signature = JSON.stringify({
    displayId: diagnostics.display.id,
    displayScaleFactor: diagnostics.display.scaleFactor,
    contentSize: diagnostics.window.contentSize,
    zoomFactor: zoom.zoomFactor,
    source: zoom.source
  });
  if (signature !== diagnosticState.lastSignature || process.env.VPBUDDY_DESKTOP_SCALE_DEBUG === "1") {
    diagnosticState.lastSignature = signature;
    console.info(`[VPBuddy display-scale] ${JSON.stringify(diagnostics)}`);
  }

  win.webContents.executeJavaScript(
    `window.VPBUDDY_DESKTOP_DISPLAY_SCALE = ${JSON.stringify(diagnostics)};`,
    true
  ).catch(() => {});
}

function installDesktopDisplayScale(win) {
  const diagnosticState = {
    lastSignature: "",
    revision: 0,
    timer: null,
    warnedInvalidOverride: false
  };

  const schedule = (reason, delay = 120) => {
    if (diagnosticState.timer) clearTimeout(diagnosticState.timer);
    diagnosticState.timer = setTimeout(() => {
      diagnosticState.timer = null;
      applyDesktopDisplayScale(win, reason, diagnosticState).catch((error) => {
        console.warn(`[VPBuddy display-scale] ${error?.message || String(error)}`);
      });
    }, delay);
  };

  const onDisplayMetricsChanged = (_event, changedDisplay) => {
    if (changedDisplay?.id === activeDisplayForWindow(win)?.id) {
      schedule("display-metrics-changed");
    }
  };

  win.webContents.on("did-finish-load", () => schedule("did-finish-load", 0));
  win.on("resize", () => schedule("resize"));
  win.on("move", () => schedule("move"));
  screen.on("display-metrics-changed", onDisplayMetricsChanged);

  win.once("closed", () => {
    diagnosticState.revision += 1;
    if (diagnosticState.timer) clearTimeout(diagnosticState.timer);
    screen.removeListener("display-metrics-changed", onDisplayMetricsChanged);
  });
}

function installStartupWindowReveal(win) {
  let revealed = false;
  let revealTimer = null;

  const reveal = (reason) => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;

    if (!win.isVisible()) win.show();
    console.info(`[VPBuddy startup] Main window shown (${reason})`);

    if (process.env.VPBUDDY_DESKTOP_DEVTOOLS === "1") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  };

  win.once("ready-to-show", () => reveal("ready-to-show"));
  win.webContents.once("did-finish-load", () => reveal("did-finish-load"));
  revealTimer = setTimeout(() => reveal("timeout"), WINDOW_REVEAL_TIMEOUT_MS);

  win.once("closed", () => {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;
  });

  return reveal;
}

function createMainWindow(url) {
  const display = screen.getPrimaryDisplay();
  const windowGeometry = calculateWindowGeometry(display);
  const win = new BrowserWindow({
    title: "VPBuddy",
    ...windowGeometry,
    center: true,
    backgroundColor: "#020b1a",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const [contentWidth, contentHeight] = win.getContentSize();
  const initialZoom = calculateDesktopZoom({
    viewportWidth: contentWidth,
    viewportHeight: contentHeight,
    displayScaleFactor: display.scaleFactor,
    platform: process.platform,
    zoomOverride: process.env.VPBUDDY_DESKTOP_ZOOM_FACTOR
  });
  win.webContents.setZoomFactor(initialZoom.zoomFactor);
  installDesktopDisplayScale(win);
  const revealMainWindow = installStartupWindowReveal(win);

  win.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    shell.openExternal(nextUrl);
    return { action: "deny" };
  });

  win.loadURL(url).catch((error) => {
    revealMainWindow("load-error");
    dialog.showErrorBox("VPBuddy failed to load", error?.message || String(error));
  });
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
    if (!win.isVisible()) win.show();
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
