import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = await readFile(path.join(repositoryRoot, "desktop", "main.cjs"), "utf8");
const {
  DISPLAY_SCALE_POLICY,
  calculateDesktopZoom,
  calculateWindowGeometry,
  parseZoomOverride
} = require(path.join(repositoryRoot, "desktop", "display-scale.cjs"));

const nativeFrame = { width: 16, height: 39 };

function simulatedDisplay(physicalWidth, physicalHeight, scaleFactor) {
  return {
    id: `${physicalWidth}x${physicalHeight}@${scaleFactor}`,
    scaleFactor,
    workAreaSize: {
      width: Math.floor(physicalWidth / scaleFactor),
      height: Math.floor((physicalHeight - 48) / scaleFactor)
    }
  };
}

function simulatedInitialScale(physicalWidth, physicalHeight, scaleFactor) {
  const display = simulatedDisplay(physicalWidth, physicalHeight, scaleFactor);
  const windowGeometry = calculateWindowGeometry(display);
  const viewportWidth = Math.max(1, windowGeometry.width - nativeFrame.width);
  const viewportHeight = Math.max(1, windowGeometry.height - nativeFrame.height);
  const scale = calculateDesktopZoom({
    viewportWidth,
    viewportHeight,
    displayScaleFactor: scaleFactor,
    platform: "win32"
  });

  return { display, windowGeometry, viewportWidth, viewportHeight, scale };
}

test("desktop windows stay inside the Windows work area at every supported DPI", () => {
  for (const [width, height] of [[1366, 768], [1920, 1080], [2048, 1221]]) {
    for (const scaleFactor of [1, 1.25, 1.5]) {
      const { display, windowGeometry } = simulatedInitialScale(width, height, scaleFactor);
      assert.ok(windowGeometry.width <= display.workAreaSize.width);
      assert.ok(windowGeometry.height <= display.workAreaSize.height);
      assert.ok(windowGeometry.minWidth <= windowGeometry.width);
      assert.ok(windowGeometry.minHeight <= windowGeometry.height);
      assert.ok(windowGeometry.width <= DISPLAY_SCALE_POLICY.preferredWindowWidth);
      assert.ok(windowGeometry.height <= DISPLAY_SCALE_POLICY.preferredWindowHeight);
    }
  }
});

test("Windows 100%, 125%, and 150% scaling retain a useful effective CSS viewport", () => {
  for (const [width, height] of [[1366, 768], [1920, 1080], [2048, 1221]]) {
    for (const scaleFactor of [1, 1.25, 1.5]) {
      const scenario = simulatedInitialScale(width, height, scaleFactor);
      const { scale } = scenario;

      assert.ok(scale.zoomFactor >= DISPLAY_SCALE_POLICY.minimumZoomFactor);
      assert.ok(scale.zoomFactor <= DISPLAY_SCALE_POLICY.maximumZoomFactor);
      assert.ok(
        scale.effectiveCssViewport.width >= 1220,
        `${width}x${height} at ${scaleFactor * 100}% fell below the 1220px desktop breakpoint`
      );
      assert.ok(scale.effectiveCssViewport.height >= 600);

      if (scaleFactor === 1 && width >= 1920) {
        assert.ok(scale.zoomFactor >= 0.98, "large 100% displays should retain native-scale content");
      }
      if (scaleFactor === 1.25) {
        assert.ok(scale.zoomFactor <= 0.8, "125% system scaling should not enlarge Electron content");
      }
      if (scaleFactor === 1.5) {
        assert.equal(scale.zoomFactor, DISPLAY_SCALE_POLICY.minimumZoomFactor);
      }
    }
  }
});

test("DPI compensation is Windows-specific and environment overrides are bounded", () => {
  const windowsScale = calculateDesktopZoom({
    viewportWidth: 1440,
    viewportHeight: 840,
    displayScaleFactor: 1.25,
    platform: "win32"
  });
  const macScale = calculateDesktopZoom({
    viewportWidth: 1440,
    viewportHeight: 840,
    displayScaleFactor: 2,
    platform: "darwin"
  });

  assert.equal(windowsScale.zoomFactor, 0.8);
  assert.equal(windowsScale.limitingFactor, "windows-dpi");
  assert.equal(macScale.zoomFactor, 1, "Retina DPR must not be mistaken for Windows UI scaling");

  assert.deepEqual(parseZoomOverride("86%"), {
    status: "applied",
    value: 0.86,
    requested: 0.86,
    raw: "86%"
  });
  assert.equal(parseZoomOverride("0.2").value, 0.5);
  assert.equal(parseZoomOverride("2").value, 1.25);
  assert.equal(parseZoomOverride("not-a-number").status, "invalid");

  const overridden = calculateDesktopZoom({
    viewportWidth: 900,
    viewportHeight: 500,
    displayScaleFactor: 1.5,
    platform: "win32",
    zoomOverride: "0.86"
  });
  assert.equal(overridden.zoomFactor, 0.86);
  assert.equal(overridden.source, "environment");
});

test("Electron main applies and diagnoses zoom without changing browser CSS", () => {
  assert.match(mainSource, /\{\s*app,\s*BrowserWindow,\s*dialog,\s*screen,\s*shell\s*\}\s*=\s*require\(["']electron["']\)/);
  assert.match(mainSource, /screen\.getPrimaryDisplay\(\)/);
  assert.match(mainSource, /screen\.getDisplayMatching\(win\.getBounds\(\)\)/);
  assert.match(mainSource, /win\.getContentSize\(\)/);
  assert.match(mainSource, /win\.setMinimumSize\(/);
  assert.match(mainSource, /win\.setBounds\(/);
  assert.match(mainSource, /window\.devicePixelRatio/);
  assert.match(mainSource, /webContents\.setZoomFactor\(/);
  assert.match(mainSource, /VPBUDDY_DESKTOP_ZOOM_FACTOR/);
  assert.match(mainSource, /VPBUDDY_DESKTOP_DISPLAY_SCALE/);
  assert.match(mainSource, /display-metrics-changed/);
  assert.doesNotMatch(mainSource, /force-device-scale-factor/);
  assert.doesNotMatch(mainSource, /style\.transform|document\.documentElement\.style\.zoom/);
});

test("packaged startup cannot leave the main window permanently hidden", () => {
  assert.match(mainSource, /const WINDOW_REVEAL_TIMEOUT_MS = 3000/);
  assert.match(mainSource, /win\.once\("ready-to-show", \(\) => reveal\("ready-to-show"\)\)/);
  assert.match(mainSource, /win\.webContents\.once\("did-finish-load", \(\) => reveal\("did-finish-load"\)\)/);
  assert.match(mainSource, /setTimeout\(\(\) => reveal\("timeout"\), WINDOW_REVEAL_TIMEOUT_MS\)/);
  assert.match(mainSource, /if \(!win\.isVisible\(\)\) win\.show\(\)/);
  assert.match(mainSource, /revealMainWindow\("load-error"\)/);
});
