// 桌面能力抽象层：Tauri 环境下走原生 API，浏览器开发时 fallback 到 Web API。
// 这样 npm run dev 远程开发不受影响，打包成 Tauri 应用时自动用原生能力。

import { createAPIClient as createJsApiClient } from "./api/client";
import { httpBaseURL } from "./config";
import type { RealtimeStatus } from "./realtime/client";
import type {
  LoginResponse,
  CurrentUser,
  OnlineUser,
  ChatMessage,
  Group,
  GroupMember,
  CreateGroupRequest,
  CreateGroupResponse,
  AddGroupMemberRequest,
  UploadResponse,
  UploadTarget,
  ProfileData,
  ProfileImageKind,
} from "./protocol";

let isTauri: boolean | null = null;

export function runningInTauri(): boolean {
  if (isTauri === null) {
    isTauri = "__TAURI_INTERNALS__" in window;
  }
  return isTauri;
}

// 后端返回的资料图片是 API 相对路径。浏览器开发模式保留相对路径交给
// Vite proxy；Tauri 则补上运行时后端地址，避免图片请求落到 WebView 自身。
export function resolveAPIResourceURL(path: string): string {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path;
  return `${httpBaseURL}${path}`;
}

// 浏览器可以通过 <input type="file"> 取得 File 对象；Tauri 则更适合让
// 原生文件选择器返回路径，再由 Rust 读取并上传。这样文件内容不会受 WebView
// 的网络与本地文件访问限制影响。
export async function selectDesktopFilePath(options?: { imagesOnly?: boolean }): Promise<string | null> {
  if (!runningInTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    directory: false,
    ...(options?.imagesOnly
      ? { filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png"] }] }
      : {}),
  });
  return typeof selected === "string" ? selected : null;
}

export type DesktopWindowState = {
  focused: boolean;
  visible: boolean;
};

type Unlisten = () => void;

function normalizeTauriPayload<T>(payload: T | string): T {
  if (typeof payload === "string") {
    return JSON.parse(payload) as T;
  }
  return payload;
}

// ── 桌面窗口 / 托盘事件 ──

export async function listenDesktopReconnect(
  callback: () => void,
): Promise<Unlisten> {
  if (!runningInTauri()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen("desktop://reconnect", callback);
}

export async function listenDesktopWindowState(
  callback: (state: DesktopWindowState) => void,
): Promise<Unlisten> {
  const emitBrowserState = () => {
    callback({
      focused: document.hasFocus(),
      visible: document.visibilityState === "visible",
    });
  };

  window.addEventListener("focus", emitBrowserState);
  window.addEventListener("blur", emitBrowserState);
  document.addEventListener("visibilitychange", emitBrowserState);
  emitBrowserState();

  if (!runningInTauri()) {
    return () => {
      window.removeEventListener("focus", emitBrowserState);
      window.removeEventListener("blur", emitBrowserState);
      document.removeEventListener("visibilitychange", emitBrowserState);
    };
  }

  const { listen } = await import("@tauri-apps/api/event");
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const currentWindow = getCurrentWindow();

  async function emitTauriState(patch: Partial<DesktopWindowState> = {}) {
    callback({
      focused: await currentWindow.isFocused(),
      visible: await currentWindow.isVisible(),
      ...patch,
    });
  }

  const unlistenFocus = await currentWindow.onFocusChanged(({ payload }) => {
    void emitTauriState({ focused: payload });
  });
  const unlistenVisible = await listen<boolean>(
    "desktop://window-visible",
    ({ payload }) => {
      void emitTauriState({ visible: payload });
    },
  );

  void emitTauriState();

  return () => {
    window.removeEventListener("focus", emitBrowserState);
    window.removeEventListener("blur", emitBrowserState);
    document.removeEventListener("visibilitychange", emitBrowserState);
    unlistenFocus();
    unlistenVisible();
  };
}

// ── Token 安全存储 ──

const TOKEN_KEY = "chatter3-jwt";
const STORE_PATH = ".store.dat";
const CHAT_ARCHIVE_PREFIX = "chat-archive:v1:";

let _storePromise: Promise<unknown> | null = null;

async function getStore() {
  if (!_storePromise) {
    _storePromise = import("@tauri-apps/plugin-store")
      .then((m) => m.load(STORE_PATH))
      .catch((error) => {
        _storePromise = null;
        throw error;
      });
  }
  return _storePromise;
}

async function setStoreValue(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  await (store as any).set(key, value);
  await (store as any).save();
}

async function getStoreValue<T>(key: string): Promise<T | null> {
  const store = await getStore();
  return ((await (store as any).get(key)) as T | null) ?? null;
}

async function deleteStoreValue(key: string): Promise<void> {
  const store = await getStore();
  await (store as any).delete(key);
  await (store as any).save();
}

async function invokeDesktopCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function saveDesktopPreference(
  key: string,
  value: string,
): Promise<void> {
  if (runningInTauri()) {
    await setStoreValue(key, value);
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, value);
}

export async function loadDesktopPreference(
  key: string,
): Promise<string | null> {
  if (runningInTauri()) {
    const storedValue = await getStoreValue<string>(key);
    if (storedValue) return storedValue;

    const legacyValue = localStorage.getItem(key);
    if (legacyValue) {
      await setStoreValue(key, legacyValue);
      localStorage.removeItem(key);
    }
    return legacyValue;
  }
  return localStorage.getItem(key);
}

export async function saveToken(token: string): Promise<void> {
  if (runningInTauri()) {
    await invokeDesktopCommand<void>("save_desktop_token", { token });
    await deleteStoreValue(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (runningInTauri()) {
    const value = await invokeDesktopCommand<string | null>(
      "load_desktop_token",
    );
    if (value) return value;

    const legacyValue =
      (await getStoreValue<string>(TOKEN_KEY)) ?? localStorage.getItem(TOKEN_KEY);
    if (legacyValue) {
      await invokeDesktopCommand<void>("save_desktop_token", {
        token: legacyValue,
      });
      await deleteStoreValue(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
    return legacyValue;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  let firstError: unknown;
  if (runningInTauri()) {
    try {
      await invokeDesktopCommand<void>("clear_desktop_token");
    } catch (error) {
      firstError = error;
    }
    try {
      await deleteStoreValue(TOKEN_KEY);
    } catch (error) {
      firstError ??= error;
    }
  }
  // 即使系统凭据库不可用，也继续清理旧版 store/localStorage，尽量减少
  // 下次启动恢复出已退出 token 的机会。最后再把首个错误交给状态层展示。
  localStorage.removeItem(TOKEN_KEY);
  if (firstError) throw firstError;
}

// ── SQLite 消息持久化 ──

export type MessageRow = {
  localId: string;
  conversationId: string;
  messageId?: number | null;
  scope: string;
  senderId?: number | null;
  senderUsername: string;
  senderNickname: string;
  receiverUsername?: string | null;
  groupId?: number | null;
  contentType: string;
  content: string;
  fileJson?: string | null;
  timestamp: string;
  deliveryStatus: string;
  clientRequestId?: string | null;
  error?: string | null;
};

export type ConversationRow = {
  id: string;
  scope: string;
  title: string;
  peerUsername: string;
  groupId?: number | null;
  description: string;
  lastMessage?: string | null;
  updatedAt?: string | null;
  unreadCount: number;
};

async function invokeDb<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function dbInsertMessage(msg: MessageRow): Promise<void> {
  if (!runningInTauri()) return;
  await invokeDb("db_insert_message", {
    msg: { ...msg, local_id: msg.localId, conversation_id: msg.conversationId, message_id: msg.messageId, sender_id: msg.senderId, sender_username: msg.senderUsername, sender_nickname: msg.senderNickname, receiver_username: msg.receiverUsername, group_id: msg.groupId, content_type: msg.contentType, file_json: msg.fileJson, delivery_status: msg.deliveryStatus, client_request_id: msg.clientRequestId },
  });
}

export async function dbGetMessages(
  conversationId: string,
  before?: string,
  limit = 50,
): Promise<MessageRow[]> {
  if (!runningInTauri()) return [];
  const rows = await invokeDb<Array<Record<string, unknown>>>("db_get_messages", {
    conversationId,
    before: before ?? null,
    limit,
  });
  return rows.map(r => ({
    localId: r.local_id as string,
    conversationId: r.conversation_id as string,
    messageId: r.message_id as number | null,
    scope: r.scope as string,
    senderId: r.sender_id as number | null,
    senderUsername: r.sender_username as string,
    senderNickname: r.sender_nickname as string,
    receiverUsername: r.receiver_username as string | null,
    groupId: r.group_id as number | null,
    contentType: r.content_type as string,
    content: r.content as string,
    fileJson: r.file_json as string | null,
    timestamp: r.timestamp as string,
    deliveryStatus: r.delivery_status as string,
    clientRequestId: r.client_request_id as string | null,
    error: r.error as string | null,
  }));
}

export async function dbConfirmMessage(
  clientRequestId: string,
  serverMsg: MessageRow,
): Promise<void> {
  if (!runningInTauri()) return;
  await invokeDb("db_confirm_message", {
    clientRequestId,
    serverMsg: { ...serverMsg, local_id: serverMsg.localId, conversation_id: serverMsg.conversationId, message_id: serverMsg.messageId, sender_id: serverMsg.senderId, sender_username: serverMsg.senderUsername, sender_nickname: serverMsg.senderNickname, receiver_username: serverMsg.receiverUsername, group_id: serverMsg.groupId, content_type: serverMsg.contentType, file_json: serverMsg.fileJson, delivery_status: serverMsg.deliveryStatus, client_request_id: serverMsg.clientRequestId },
  });
}

export async function dbUpsertConversation(
  conv: ConversationRow,
): Promise<void> {
  if (!runningInTauri()) return;
  await invokeDb("db_upsert_conversation", {
    conv: { id: conv.id, scope: conv.scope, title: conv.title, peer_username: conv.peerUsername, group_id: conv.groupId, description: conv.description, last_message: conv.lastMessage, updated_at: conv.updatedAt, unread_count: conv.unreadCount },
  });
}

export async function dbGetConversations(): Promise<ConversationRow[]> {
  if (!runningInTauri()) return [];
  const rows = await invokeDb<Array<Record<string, unknown>>>("db_get_conversations");
  return rows.map(r => ({
    id: r.id as string,
    scope: r.scope as string,
    title: r.title as string,
    peerUsername: r.peer_username as string,
    groupId: r.group_id as number | null,
    description: r.description as string,
    lastMessage: r.last_message as string | null,
    updatedAt: r.updated_at as string | null,
    unreadCount: r.unread_count as number,
  }));
}

// ── 本地聊天记录快照 (legacy, 浏览器 dev fallback) ──

export async function saveChatArchiveSnapshot(
  username: string,
  snapshot: unknown,
): Promise<void> {
  const key = `${CHAT_ARCHIVE_PREFIX}${username}`;
  if (runningInTauri()) {
    await setStoreValue(key, snapshot);
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(snapshot));
}

export async function loadChatArchiveSnapshot<T>(
  username: string,
): Promise<T | null> {
  const key = `${CHAT_ARCHIVE_PREFIX}${username}`;
  if (runningInTauri()) {
    const snapshot = await getStoreValue<T>(key);
    if (snapshot) return snapshot;

    const legacyValue = localStorage.getItem(key);
    if (!legacyValue) return null;
    try {
      const parsed = JSON.parse(legacyValue) as T;
      await setStoreValue(key, parsed);
      localStorage.removeItem(key);
      return parsed;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  const snapshot = localStorage.getItem(key);
  if (!snapshot) return null;
  try {
    return JSON.parse(snapshot) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

// ── 原生通知 ──

export async function showNotification(
  title: string,
  body: string,
): Promise<void> {
  if (runningInTauri()) {
    const {
      sendNotification,
      requestPermission,
      isPermissionGranted,
    } = await import("@tauri-apps/plugin-notification");
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const result = await requestPermission();
      permissionGranted = result === "granted";
    }
    if (permissionGranted) {
      sendNotification({ title, body });
    }
    return;
  }
  if ("Notification" in window && Notification.permission !== "denied") {
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body });
    }
  }
}

// ── Unified API (Tauri invoke / browser fetch fallback) ──

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export function createUnifiedAPI(baseURL: string) {
  const jsApi = createJsApiClient(baseURL);

  return {
    login: (payload: Parameters<typeof jsApi.login>[0]) =>
      runningInTauri()
        ? tauriInvoke<LoginResponse>("api_login", { payload })
        : jsApi.login(payload),
    register: (payload: Parameters<typeof jsApi.register>[0]) =>
      runningInTauri()
        ? tauriInvoke<{ user: CurrentUser }>("api_register", { payload })
        : jsApi.register(payload),
    getOnlineUsers: (token: string) =>
      runningInTauri()
        ? tauriInvoke<OnlineUser[]>("api_get_online_users", { token })
        : jsApi.getOnlineUsers(token),
    getPublicHistory: (token: string) =>
      jsApi.getPublicHistory(token),
    getPrivateHistory: (token: string, username: string) =>
      jsApi.getPrivateHistory(token, username),
    getPublicHistoryPage: async (token: string, cursor?: string) => {
      if (runningInTauri()) {
        const r = await tauriInvoke<{ data: ChatMessage[]; nextCursor?: string | null }>("api_get_public_history", { token, cursor: cursor ?? null });
        return { data: r.data, nextCursor: r.nextCursor ?? undefined };
      }
      return jsApi.getPublicHistoryPage(token, cursor);
    },
    getPrivateHistoryPage: async (token: string, username: string, cursor?: string) => {
      if (runningInTauri()) {
        const r = await tauriInvoke<{ data: ChatMessage[]; nextCursor?: string | null }>("api_get_private_history", { token, username, cursor: cursor ?? null });
        return { data: r.data, nextCursor: r.nextCursor ?? undefined };
      }
      return jsApi.getPrivateHistoryPage(token, username, cursor);
    },
    createGroup: (token: string, payload: CreateGroupRequest) =>
      runningInTauri()
        ? tauriInvoke<CreateGroupResponse>("api_create_group", { token, payload })
        : jsApi.createGroup(token, payload),
    listGroups: (token: string) =>
      runningInTauri()
        ? tauriInvoke<Group[]>("api_list_groups", { token })
        : jsApi.listGroups(token),
    getGroup: (token: string, groupID: number) =>
      runningInTauri()
        ? tauriInvoke<Group>("api_get_group", { token, groupId: groupID })
        : jsApi.getGroup(token, groupID),
    getGroupMembers: (token: string, groupID: number) =>
      runningInTauri()
        ? tauriInvoke<GroupMember[]>("api_get_group_members", { token, groupId: groupID })
        : jsApi.getGroupMembers(token, groupID),
    addGroupMembers: (token: string, groupID: number, payload: AddGroupMemberRequest) =>
      runningInTauri()
        ? tauriInvoke<GroupMember[]>("api_add_group_members", { token, groupId: groupID, payload })
        : jsApi.addGroupMembers(token, groupID, payload),
    removeGroupMember: (token: string, groupID: number, username: string) =>
      runningInTauri()
        ? tauriInvoke<void>("api_remove_group_member", { token, groupId: groupID, username })
        : jsApi.removeGroupMember(token, groupID, username),
    getGroupHistoryPage: async (token: string, groupID: number, cursor?: string) => {
      if (runningInTauri()) {
        const r = await tauriInvoke<{ data: ChatMessage[]; nextCursor?: string | null }>("api_get_group_history", { token, groupId: groupID, cursor: cursor ?? null });
        return { data: r.data, nextCursor: r.nextCursor ?? undefined };
      }
      return jsApi.getGroupHistoryPage(token, groupID, cursor);
    },
    uploadFileFromPath: (token: string, filePath: string, target: UploadTarget) =>
      tauriInvoke<UploadResponse>("api_upload_file", {
        token,
        filePath,
        receiverUsername: target.scope === "private" ? target.receiverUsername : null,
        groupId: target.scope === "group" ? target.groupID : null,
      }),
    uploadFile: (token: string, file: File, target: UploadTarget) =>
      jsApi.uploadFile(token, file, target),
    getProfile: (token: string, username: string) =>
      runningInTauri()
        ? tauriInvoke<ProfileData>("api_get_user_profile", { token, username })
        : jsApi.getProfile(token, username),
    updateProfile: (token: string, username: string, payload: { nickname?: string; bio?: string; email?: string; gender?: number }) =>
      runningInTauri()
        ? tauriInvoke<ProfileData>("api_update_user_profile", { token, username, payload })
        : jsApi.updateProfile(token, username, payload),
    uploadProfileImage: (token: string, username: string, kind: ProfileImageKind, file: File) =>
      jsApi.uploadProfileImage(token, username, kind, file),
    uploadProfileImageFromPath: (token: string, username: string, kind: ProfileImageKind, filePath: string) =>
      tauriInvoke<ProfileData>("api_upload_profile_image", { token, username, kind, filePath }),
    getDownloadURL: (fileID: number) =>
      `${baseURL}/api/v2/files/${fileID}`,
  };
}

export async function loadDesktopFileBytes(
  token: string,
  fileID: number,
): Promise<number[]> {
  return tauriInvoke<number[]>("api_download_file_bytes", { token, fileId: fileID });
}

export async function saveDesktopFile(
  token: string,
  fileID: number,
  suggestedFileName: string,
): Promise<boolean> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const destinationPath = await save({ defaultPath: suggestedFileName });
  if (!destinationPath) return false;

  await tauriInvoke<void>("api_save_file", {
    token,
    fileId: fileID,
    destinationPath,
  });
  return true;
}

// ── Unified Realtime (Tauri WS / browser WebSocket fallback) ──

import { createRealtimeClient as createJsRealtimeClient } from "./realtime/client";

export function createUnifiedRealtime(wsBaseURL: string) {
  const jsRealtime = createJsRealtimeClient(wsBaseURL);

  if (!runningInTauri()) {
    return jsRealtime;
  }

  let unlistenEvent: Unlisten | null = null;
  let unlistenStatus: Unlisten | null = null;
  let unlistenReconnect: Unlisten | null = null;
  let unlistenError: Unlisten | null = null;
  let connectionGeneration = 0;

  async function setupTauriListeners(
    handlers: Parameters<typeof jsRealtime.connect>[1],
  ) {
    unlistenEvent?.();
    unlistenStatus?.();
    unlistenReconnect?.();
    unlistenError?.();

    const { listen } = await import("@tauri-apps/api/event");

    unlistenEvent = await listen<string>("realtime://event", (event) => {
      try {
        const data = JSON.parse(event.payload);
        switch (data.event) {
          case "session.ready":
            handlers.onReady(data.payload);
            break;
          case "presence.online":
          case "presence.offline":
            handlers.onPresence(data.payload);
            break;
          case "chat.public.message":
            handlers.onPublicMessage(data.payload, data.requestId);
            break;
          case "chat.private.message":
            handlers.onPrivateMessage(data.payload, data.requestId);
            break;
          case "chat.group.message":
            handlers.onGroupMessage(data.payload, data.requestId);
            break;
          case "group.changed":
            // Rust 层只负责维持桌面 WebSocket 并转发原始事件；业务状态仍由
            // React/Zustand 处理，因此浏览器模式和 Tauri 模式共用同一套语义。
            handlers.onGroupChanged(data.payload);
            break;
          case "user.profile.changed":
            handlers.onProfileChanged(data.payload);
            break;
          case "error":
            handlers.onError(data.payload.message, data.payload.code);
            break;
        }
      } catch {
        handlers.onError("Failed to parse realtime event");
      }
    });

    unlistenStatus = await listen<{ status: RealtimeStatus } | string>("realtime://status", (event) => {
      try {
        const { status } = normalizeTauriPayload<{ status: RealtimeStatus }>(
          event.payload,
        );
        handlers.onStatusChange(status);
      } catch { /* ignore */ }
    });

    unlistenReconnect = await listen<{ attempt: number; delayMs: number } | string>("realtime://reconnect", (event) => {
      try {
        const { attempt, delayMs } = normalizeTauriPayload<{
          attempt: number;
          delayMs: number;
        }>(event.payload);
        handlers.onReconnectScheduled?.(attempt, delayMs);
      } catch { /* ignore */ }
    });

    // Rust realtime 会提供比浏览器 onerror 更具体的连接/关闭原因。
    // 之前没有监听这个事件，导致桌面端只看到“正在重连”而看不到根因。
    unlistenError = await listen<{ message: string } | string>("realtime://error", (event) => {
      try {
        const { message } = normalizeTauriPayload<{ message: string }>(event.payload);
        handlers.onError(message);
      } catch {
        handlers.onError("Realtime connection failed");
      }
    });
  }

  return {
    connect(
      token: string,
      handlers: Parameters<typeof jsRealtime.connect>[1],
      options?: { maxReconnectAttempts?: number; reconnectBaseDelayMs?: number },
    ) {
      const generation = ++connectionGeneration;
      handlers.onStatusChange("connecting");
      void (async () => {
        // Tauri 的事件监听注册本身是异步的。必须先等 listener 就绪再让 Rust
        // 建立连接，否则很快到达的 session.ready 或连接错误会永久丢失。
        await setupTauriListeners(handlers);
        if (generation !== connectionGeneration) return;
        await tauriInvoke("realtime_connect", { wsBaseUrl: wsBaseURL, token });
      })().catch((error) => {
        if (generation !== connectionGeneration) return;
        handlers.onStatusChange("error");
        handlers.onError(
          error instanceof Error ? error.message : String(error),
        );
      });
    },
    disconnect() {
      connectionGeneration += 1;
      unlistenEvent?.();
      unlistenStatus?.();
      unlistenReconnect?.();
      unlistenError?.();
      void tauriInvoke("realtime_disconnect");
    },
    async sendPublicMessage(payload: { content: string }, requestId?: string) {
      return tauriInvoke<boolean>("realtime_send", {
        event: "chat.public.send",
        payload,
        requestId: requestId ?? null,
      });
    },
    async sendPrivateMessage(
      payload: { receiverUsername: string; content: string },
      requestId?: string,
    ) {
      return tauriInvoke<boolean>("realtime_send", {
        event: "chat.private.send",
        payload,
        requestId: requestId ?? null,
      });
    },
    async sendGroupMessage(
      payload: { groupID: number; content: string },
      requestId?: string,
    ) {
      return tauriInvoke<boolean>("realtime_send", {
        event: "chat.group.send",
        payload,
        requestId: requestId ?? null,
      });
    },
  };
}
