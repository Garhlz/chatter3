export const httpBaseURL = import.meta.env.CHATTER_HTTP_BASE_URL ?? "";

export const wsBaseURL =
  import.meta.env.CHATTER_WS_URL ??
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
    window.location.host
  }/api/v2/ws`;
