window.VPBUDDY_API_BASE_URL = window.VPBUDDY_API_BASE_URL
  || window.localStorage?.getItem("vpbuddy.apiBaseUrl")
  || "http://127.0.0.1:8765";
window.VPBUDDY_DESKTOP = Boolean(window.VPBUDDY_DESKTOP);
