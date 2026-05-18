/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CHATTER_HTTP_BASE_URL?: string;
  readonly CHATTER_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __CHATTER_RUNTIME_CONFIG__?: {
    httpBaseURL: string;
    wsBaseURL: string;
  };
}
