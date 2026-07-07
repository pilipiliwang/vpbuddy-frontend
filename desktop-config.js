window.VPBUDDY_API_BASE_URL = window.VPBUDDY_API_BASE_URL
  || window.localStorage?.getItem("vpbuddy.apiBaseUrl")
  || "http://47.100.182.3:28765";
window.VPBUDDY_DESKTOP = Boolean(window.VPBUDDY_DESKTOP);
