import type { RealtimeErrorPayload, SocketEvent } from "../protocol";

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

type RealtimeHandlers = {
  onStatusChange: (status: RealtimeStatus) => void;
  onError: (message: string) => void;
};

export function createRealtimeClient(baseURL: string) {
  let socket: WebSocket | null = null;

  return {
    connect(token: string, handlers: RealtimeHandlers) {
      // WebSocket 连接只负责“实时事件流”。
      // 历史消息、登录、在线用户列表等初始化数据，仍然应该走 HTTP。
      // 这种拆分能让前端状态更清楚，也避免把“请求-响应”和“推送事件”混在一个通道里。
      handlers.onStatusChange("connecting");
      const url = new URL(baseURL);
      url.searchParams.set("token", token);

      socket?.close();
      socket = new WebSocket(url);

      socket.onopen = () => {
        handlers.onStatusChange("connected");
      };

      socket.onclose = () => {
        handlers.onStatusChange("closed");
      };

      socket.onerror = () => {
        handlers.onStatusChange("error");
        handlers.onError("WebSocket connection failed");
      };

      socket.onmessage = (event) => {
        try {
          // 目前这里只先识别统一错误事件。
          // 后续接入 public/private message、presence 等事件时，也都应该从这里进入，
          // 再分发给更高层的 store 或 feature 模块。
          const payload = JSON.parse(event.data) as SocketEvent<RealtimeErrorPayload>;
          if (payload.event === "error") {
            handlers.onError(payload.payload.message);
          }
        } catch {
          handlers.onError("Failed to parse realtime event");
        }
      };
    },
    disconnect() {
      socket?.close();
      socket = null;
    },
  };
}
