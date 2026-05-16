// 桌面能力抽象层：Tauri 环境下走原生 API，浏览器开发时 fallback 到 Web API。
// 这样 npm run dev 远程开发不受影响，打包成 Tauri 应用时自动用原生能力。

let isTauri: boolean | null = null;

export function runningInTauri(): boolean {
  if (isTauri === null) {
    isTauri = "__TAURI_INTERNALS__" in window;
  }
  return isTauri;
}

export type DesktopWindowState = {
  focused: boolean;
  visible: boolean;
};

type Unlisten = () => void;

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
  if (runningInTauri()) {
    await invokeDesktopCommand<void>("clear_desktop_token");
    await deleteStoreValue(TOKEN_KEY);
  }
  localStorage.removeItem(TOKEN_KEY);
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
