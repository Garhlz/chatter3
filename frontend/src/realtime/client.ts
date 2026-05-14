import type {
  ChatMessage,
  PresencePayload,
  PrivateSendPayload,
  PublicSendPayload,
  RealtimeErrorPayload,
  SessionReadyPayload,
  SocketEvent,
} from "../protocol";

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";

type RealtimeHandlers = {
  onStatusChange: (status: RealtimeStatus) => void;
  onError: (message: string) => void;
  onReady: (payload: SessionReadyPayload) => void;
  onPresence: (payload: PresencePayload) => void;
  onPublicMessage: (message: ChatMessage) => void;
  onPrivateMessage: (message: ChatMessage) => void;
};

export function createRealtimeClient(baseURL: string) {
  let socket: WebSocket | null = null;
  let pingTimer: number | null = null;

  function stopPing() {
    if (pingTimer !== null) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  return {
    connect(token: string, handlers: RealtimeHandlers) {
      // WebSocket 连接只负责“实时事件流”。
      // 历史消息、登录、在线用户列表等初始化数据，仍然应该走 HTTP。
      // 这种拆分能让前端状态更清楚，也避免把“请求-响应”和“推送事件”混在一个通道里。
      handlers.onStatusChange("connecting");
      const url = new URL(baseURL);
      url.searchParams.set("token", token);

      stopPing();
      socket?.close();
      socket = new WebSocket(url);

      socket.onopen = () => {
        handlers.onStatusChange("connected");
        pingTimer = window.setInterval(() => {
          socket?.send(
            JSON.stringify({
              event: "session.ping",
              payload: {},
            }),
          );
        }, 30_000);
      };

      socket.onclose = () => {
        stopPing();
        handlers.onStatusChange("closed");
      };

      socket.onerror = () => {
        stopPing();
        handlers.onStatusChange("error");
        handlers.onError("WebSocket connection failed");
      };

      socket.onmessage = (event) => {
        try {
          // 所有 realtime 事件都先统一解包，再向上分发。
          // 这样 UI 层只关心“业务事件”，不需要自己重复写协议分支。
          const payload = JSON.parse(event.data) as SocketEvent<unknown>;
          switch (payload.event) {
            case "session.ready":
              handlers.onReady(payload.payload as SessionReadyPayload);
              break;
            case "presence.online":
            case "presence.offline":
              handlers.onPresence(payload.payload as PresencePayload);
              break;
            case "chat.public.message":
              handlers.onPublicMessage(payload.payload as ChatMessage);
              break;
            case "chat.private.message":
              handlers.onPrivateMessage(payload.payload as ChatMessage);
              break;
            case "error":
              handlers.onError(
                (payload.payload as RealtimeErrorPayload).message,
              );
              break;
          }
        } catch {
          handlers.onError("Failed to parse realtime event");
        }
      };
    },
    disconnect() {
      stopPing();
      socket?.close();
      socket = null;
    },
    sendPublicMessage(payload: PublicSendPayload) {
      socket?.send(
        JSON.stringify({
          event: "chat.public.send",
          payload,
        }),
      );
    },
    sendPrivateMessage(payload: PrivateSendPayload) {
      socket?.send(
        JSON.stringify({
          event: "chat.private.send",
          payload,
        }),
      );
    },
  };
}
