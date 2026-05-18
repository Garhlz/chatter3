const runtimeConfig = window.__CHATTER_RUNTIME_CONFIG__;

export const httpBaseURL =
  runtimeConfig?.httpBaseURL ??
  import.meta.env.CHATTER_HTTP_BASE_URL ??
  "";

export const wsBaseURL =
  runtimeConfig?.wsBaseURL ??
  import.meta.env.CHATTER_WS_URL ??
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
    window.location.host
  }/api/v2/ws`;
