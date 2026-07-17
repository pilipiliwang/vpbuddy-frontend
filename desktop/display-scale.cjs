// 1440x840 approximates the original 1440x900 window after its native frame.
const DISPLAY_SCALE_POLICY = Object.freeze({
  preferredWindowWidth: 1440,
  preferredWindowHeight: 900,
  minimumWindowWidth: 1100,
  minimumWindowHeight: 640,
  workAreaUsage: 0.96,
  minimumWorkAreaUsage: 0.82,
  targetCssWidth: 1440,
  targetCssHeight: 840,
  minimumZoomFactor: 0.67,
  maximumZoomFactor: 1,
  minimumOverrideZoomFactor: 0.5,
  maximumOverrideZoomFactor: 1.25
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 3) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseZoomOverride(rawValue, policy = DISPLAY_SCALE_POLICY) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
    return { status: "unset", value: null };
  }

  const raw = String(rawValue).trim();
  const percentage = raw.endsWith("%");
  const parsed = Number(percentage ? raw.slice(0, -1) : raw);
  const requested = percentage ? parsed / 100 : parsed;

  if (!Number.isFinite(requested) || requested <= 0) {
    return { status: "invalid", value: null, raw };
  }

  const value = round(clamp(
    requested,
    policy.minimumOverrideZoomFactor,
    policy.maximumOverrideZoomFactor
  ));

  return {
    status: value === requested ? "applied" : "clamped",
    value,
    requested: round(requested),
    raw
  };
}

function calculateWindowGeometry(display, policy = DISPLAY_SCALE_POLICY) {
  const workArea = display?.workAreaSize || display?.workArea || {};
  const availableWidth = Math.max(1, Math.floor(positiveNumber(workArea.width, policy.preferredWindowWidth)));
  const availableHeight = Math.max(1, Math.floor(positiveNumber(workArea.height, policy.preferredWindowHeight)));
  const usableWidth = Math.max(1, Math.floor(availableWidth * policy.workAreaUsage));
  const usableHeight = Math.max(1, Math.floor(availableHeight * policy.workAreaUsage));
  const width = Math.min(policy.preferredWindowWidth, usableWidth);
  const height = Math.min(policy.preferredWindowHeight, usableHeight);

  return {
    width,
    height,
    minWidth: Math.min(
      width,
      policy.minimumWindowWidth,
      Math.max(1, Math.floor(availableWidth * policy.minimumWorkAreaUsage))
    ),
    minHeight: Math.min(
      height,
      policy.minimumWindowHeight,
      Math.max(1, Math.floor(availableHeight * policy.minimumWorkAreaUsage))
    )
  };
}

function calculateDesktopZoom({
  viewportWidth,
  viewportHeight,
  displayScaleFactor,
  platform = process.platform,
  zoomOverride
}, policy = DISPLAY_SCALE_POLICY) {
  const width = positiveNumber(viewportWidth, policy.targetCssWidth);
  const height = positiveNumber(viewportHeight, policy.targetCssHeight);
  const scaleFactor = positiveNumber(displayScaleFactor, 1);
  const override = parseZoomOverride(zoomOverride, policy);

  if (override.value !== null) {
    return {
      zoomFactor: override.value,
      source: "environment",
      limitingFactor: "override",
      override,
      workspaceZoomFactor: round(Math.min(
        1,
        width / policy.targetCssWidth,
        height / policy.targetCssHeight
      )),
      dpiZoomFactor: 1,
      effectiveCssViewport: {
        width: Math.round(width / override.value),
        height: Math.round(height / override.value)
      }
    };
  }

  const workspaceZoomFactor = Math.min(
    1,
    width / policy.targetCssWidth,
    height / policy.targetCssHeight
  );
  // Windows scaling reduces the DIP workspace and enlarges Chromium content; compensate once here.
  const dpiZoomFactor = platform === "win32" ? Math.min(1, 1 / scaleFactor) : 1;
  const requestedZoomFactor = Math.min(workspaceZoomFactor, dpiZoomFactor);
  const zoomFactor = round(clamp(
    requestedZoomFactor,
    policy.minimumZoomFactor,
    policy.maximumZoomFactor
  ));

  let limitingFactor = "default";
  if (requestedZoomFactor < policy.minimumZoomFactor) {
    limitingFactor = "minimum-bound";
  } else if (dpiZoomFactor < workspaceZoomFactor) {
    limitingFactor = "windows-dpi";
  } else if (workspaceZoomFactor < 1) {
    limitingFactor = "workspace";
  }

  return {
    zoomFactor,
    source: "automatic",
    limitingFactor,
    override,
    workspaceZoomFactor: round(workspaceZoomFactor),
    dpiZoomFactor: round(dpiZoomFactor),
    effectiveCssViewport: {
      width: Math.round(width / zoomFactor),
      height: Math.round(height / zoomFactor)
    }
  };
}

module.exports = {
  DISPLAY_SCALE_POLICY,
  calculateDesktopZoom,
  calculateWindowGeometry,
  parseZoomOverride
};
