import type {
  ChatMessage,
  GroupSendPayload,
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
  onError: (message: string, code?: string) => void;
  onReady: (payload: SessionReadyPayload) => void;
  onPresence: (payload: PresencePayload) => void;
  onPublicMessage: (message: ChatMessage, requestId?: string) => void;
  onPrivateMessage: (message: ChatMessage, requestId?: string) => void;
  onGroupMessage: (message: ChatMessage, requestId?: string) => void;
  onReconnectScheduled?: (attempt: number, delayMs: number) => void;
};

type RealtimeConnectOptions = {
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
};

export function createRealtimeClient(baseURL: string) {
  let socket: WebSocket | null = null;
  let pingTimer: number | null = null;
  let reconnectTimer: number | null = null;
  let reconnectAttempt = 0;
  let manualClose = false;
  let activeToken = "";
  let activeHandlers: RealtimeHandlers | null = null;
  let activeOptions: Required<RealtimeConnectOptions> = {
    maxReconnectAttempts: 5,
    reconnectBaseDelayMs: 800,
  };

  function stopPing() {
    if (pingTimer !== null) {
      window.clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function stopReconnect() {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function sendEvent(event: string, payload: unknown, requestId?: string) {
    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(
      JSON.stringify({
        event,
        ...(requestId ? { requestId } : {}),
        payload,
      }),
    );
    return true;
  }

  return {
    connect(
      token: string,
      handlers: RealtimeHandlers,
      options: RealtimeConnectOptions = {},
    ) {
      // WebSocket 连接只负责“实时事件流”。
      // 历史消息、登录、在线用户列表等初始化数据，仍然应该走 HTTP。
      // 这种拆分能让前端状态更清楚，也避免把“请求-响应”和“推送事件”混在一个通道里。
      activeToken = token;
      activeHandlers = handlers;
      activeOptions = {
        maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
        reconnectBaseDelayMs: options.reconnectBaseDelayMs ?? 800,
      };
      manualClose = false;
      handlers.onStatusChange("connecting");
      const url = new URL(baseURL);
      url.searchParams.set("token", token);

      stopPing();
      stopReconnect();
      if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
      socket = new WebSocket(url);

      socket.onopen = () => {
        reconnectAttempt = 0;
        handlers.onStatusChange("connected");
        pingTimer = window.setInterval(() => {
          sendEvent("session.ping", {});
        }, 30_000);
      };

      socket.onclose = () => {
        stopPing();
        if (manualClose || !activeToken || !activeHandlers) {
          handlers.onStatusChange("closed");
          return;
        }

        if (reconnectAttempt >= activeOptions.maxReconnectAttempts) {
          handlers.onStatusChange("closed");
          handlers.onError("Realtime connection closed after reconnect attempts");
          return;
        }

        reconnectAttempt += 1;
        const delayMs = Math.min(
          activeOptions.reconnectBaseDelayMs * 2 ** (reconnectAttempt - 1),
          12_000,
        );
        handlers.onStatusChange("connecting");
        handlers.onReconnectScheduled?.(reconnectAttempt, delayMs);
        reconnectTimer = window.setTimeout(() => {
          if (activeToken && activeHandlers) {
            this.connect(activeToken, activeHandlers, activeOptions);
          }
        }, delayMs);
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
              handlers.onPublicMessage(
                payload.payload as ChatMessage,
                payload.requestId,
              );
              break;
            case "chat.private.message":
              handlers.onPrivateMessage(
                payload.payload as ChatMessage,
                payload.requestId,
              );
              break;
            case "chat.group.message":
              handlers.onGroupMessage(
                payload.payload as ChatMessage,
                payload.requestId,
              );
              break;
            case "error":
              handlers.onError(
                (payload.payload as RealtimeErrorPayload).message,
                (payload.payload as RealtimeErrorPayload).code,
              );
              break;
          }
        } catch {
          handlers.onError("Failed to parse realtime event");
        }
      };
    },
    disconnect() {
      manualClose = true;
      stopPing();
      stopReconnect();
      socket?.close();
      socket = null;
    },
    sendPublicMessage(payload: PublicSendPayload, requestId?: string) {
      return sendEvent("chat.public.send", payload, requestId);
    },
    sendPrivateMessage(payload: PrivateSendPayload, requestId?: string) {
      return sendEvent("chat.private.send", payload, requestId);
    },
    sendGroupMessage(payload: GroupSendPayload, requestId?: string) {
      return sendEvent("chat.group.send", payload, requestId);
    },
  };
}
