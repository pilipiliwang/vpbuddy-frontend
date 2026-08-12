const isDesktopRuntime = Boolean(window.VPBUDDY_DESKTOP);
const isWebRuntime = !isDesktopRuntime && ["http:", "https:"].includes(window.location.protocol);

window.VPBUDDY_RUNTIME_API_BASE_URL = window.VPBUDDY_RUNTIME_API_BASE_URL
  || (isWebRuntime ? `${window.location.origin}/vpbuddy` : "");
window.VPBUDDY_API_BASE_URL = window.VPBUDDY_RUNTIME_API_BASE_URL
  || window.VPBUDDY_API_BASE_URL
  || window.localStorage?.getItem("vpbuddy.apiBaseUrl")
  || "http://47.100.182.3:28765";
window.VPBUDDY_API_BASE_LOCKED = isWebRuntime;
window.VPBUDDY_DESKTOP = isDesktopRuntime;
window.VPBUDDY_WEB = isWebRuntime;
