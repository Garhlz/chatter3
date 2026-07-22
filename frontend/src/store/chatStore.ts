import { create } from "zustand";
import { APIClientError } from "../api/client";
import { httpBaseURL, wsBaseURL } from "../config";
import {
  saveToken,
  clearToken,
  loadToken,
  loadChatArchiveSnapshot,
  loadDesktopPreference,
  saveChatArchiveSnapshot,
  saveDesktopPreference,
  showNotification,
  dbInsertMessage,
  dbGetMessages,
  dbGetConversations,
  dbUpsertConversation,
  createUnifiedAPI,
  createUnifiedRealtime,
  type DesktopWindowState,
  type MessageRow,
} from "../desktop";
import {
  getInitialLanguage,
  LANGUAGE_KEY,
  persistLanguage,
  t,
  type Language,
} from "../i18n";
import { type RealtimeStatus } from "../realtime/client";
import {
  applyResolvedTheme,
  getInitialThemeMode,
  THEME_KEY,
  persistThemeMode,
  resolveThemeMode,
  type ResolvedTheme,
  type ThemeMode,
} from "../theme";
import type {
  ChatMessage,
  CurrentUser,
  Group,
  GroupChangedPayload,
  GroupMember,
  LoginRequest,
  OnlineUser,
  RegisterRequest,
  ProfileData,
  UploadTarget,
} from "../protocol";
import {
  activeView,
  confirmMatchingPendingMessage,
  conversationIdFor,
  createOptimisticMessage,
  failSendingMessages,
  groupConversation,
  mergeMessages,
  normalizeMessages,
  peerForMessage,
  privateConversation,
  publicConversation,
  publicConversationId,
  sortedConversationList,
} from "./helpers";
import type { ChatMessageView, Conversation, ConversationScope, HistoryView } from "./helpers";

type ChatState = {
  token: string;
  language: Language;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  loginForm: LoginRequest;
  registerForm: RegisterRequest;
  currentUser: CurrentUser | null;
  status: RealtimeStatus;
  reconnectAttempt: number;
  messagesByConversation: Record<string, ChatMessageView[]>;
  conversations: Record<string, Conversation>;
  activeConversationId: string;
  historyCursors: Record<string, string | undefined>;
  historyLoading: boolean;
  scrollPositions: Record<string, number>;
  error: string;
  authExpired: boolean;
  notice: string;
  lastSelectedFile: string;
  historyTarget: string;
  onlineUsers: OnlineUser[];
  draftsByConversation: Record<string, string>;
  groups: Group[];
  profilesByUsername: Record<string, ProfileData>;
  newGroupName: string;
  newGroupMembers: string;
  uploadingCount: number;
  windowFocused: boolean;
  windowVisible: boolean;
  setLoginForm: (patch: Partial<LoginRequest>) => void;
  setRegisterForm: (patch: Partial<RegisterRequest>) => void;
  setHistoryTarget: (historyTarget: string) => void;
  setDraft: (draft: string) => void;
  setLastSelectedFile: (lastSelectedFile: string) => void;
  setNewGroupName: (name: string) => void;
  setNewGroupMembers: (members: string) => void;
  setConversationScrollTop: (conversationId: string, scrollTop: number) => void;
  login: () => Promise<void>;
  register: () => Promise<void>;
  logout: () => Promise<void>;
  loadPublicHistory: () => Promise<void>;
  loadPrivateHistory: (username?: string) => Promise<void>;
  loadOlderHistory: () => Promise<void>;
  openConversation: (conversationId: string) => void;
  openPrivateConversation: (
    username: string,
    options?: { preloadHistory?: boolean },
  ) => Promise<void>;
  reloadActiveHistory: () => Promise<void>;
  refreshOnlineUsers: () => Promise<void>;
  reconnect: () => void;
  sendMessage: () => Promise<void>;
  retryMessage: (localId: string) => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
  clearNotice: () => void;
  clearFeedback: () => void;
  createGroup: () => Promise<void>;
  loadGroups: () => Promise<void>;
  loadGroupHistory: (groupID: number) => Promise<void>;
  addGroupMembers: (groupID: number, usernames: string[]) => Promise<void>;
  removeGroupMember: (groupID: number, username: string) => Promise<void>;
  uploadFile: (file: File, target: UploadTarget) => Promise<void>;
  uploadFileFromPath: (filePath: string, target: UploadTarget) => Promise<void>;
  bootstrapSession: () => Promise<void>;
  setLanguage: (language: Language) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
  setResolvedTheme: (resolvedTheme: ResolvedTheme) => void;
  setDesktopWindowState: (windowState: DesktopWindowState) => void;
  hydrateDesktopPreferences: () => Promise<void>;
};

const api = createUnifiedAPI(httpBaseURL);
const realtime = createUnifiedRealtime(wsBaseURL);

// 防火墙：异步副作用不需要阻塞时用来包裹，阻止 unhandled rejection
function fireAndForget(p: Promise<unknown>) {
  p.catch(() => {});
}
const initialThemeMode = getInitialThemeMode();
const initialResolvedTheme = resolveThemeMode(initialThemeMode);
const CHAT_ARCHIVE_VERSION = 1;
const MAX_ARCHIVE_MESSAGES_PER_CONVERSATION = 200;
const ARCHIVE_PERSIST_DELAY_MS = 400;

applyResolvedTheme(initialResolvedTheme);

const initialMessages = normalizeMessages([
  {
    messageId: 1,
    scope: "public",
    sender: { userId: 1, username: "system", nickname: "System", online: true },
    contentType: "text",
    content: "Chatter3 frontend scaffold is ready.",
    timestamp: "2026-05-14T12:00:00Z",
  },
]);

type PersistedChatArchive = {
  version: number;
  cachedAt: string;
  username: string;
  activeConversationId: string;
  messagesByConversation: Record<string, ChatMessageView[]>;
  conversations: Record<string, Conversation>;
  historyCursors: Record<string, string | undefined>;
  scrollPositions: Record<string, number>;
  historyTarget: string;
};

let archivePersistTimer: number | null = null;

function toMessageRow(
  msg: ChatMessageView,
  conversationId: string,
): MessageRow {
  return {
    localId: msg.localId,
    conversationId,
    messageId: msg.messageId > 0 ? msg.messageId : null,
    scope: msg.scope,
    senderId: msg.sender.userId,
    senderUsername: msg.sender.username,
    senderNickname: msg.sender.nickname,
    receiverUsername: msg.receiverUsername ?? null,
    groupId: msg.groupID ?? null,
    contentType: msg.contentType,
    content: msg.content,
    fileJson: msg.file ? JSON.stringify(msg.file) : null,
    timestamp: msg.timestamp,
    deliveryStatus: msg.deliveryStatus,
    clientRequestId: msg.clientRequestId ?? null,
    error: msg.error ?? null,
  };
}

function persistMessage(msg: ChatMessageView, conversationId: string) {
  fireAndForget(dbInsertMessage(toMessageRow(msg, conversationId)));
}

function persistConversation(cid: string, conv: Conversation) {
  fireAndForget(
    dbUpsertConversation({
      id: cid,
      scope: conv.scope,
      title: conv.title,
      peerUsername: conv.peerUsername,
      groupId: conv.groupID ?? null,
      description: conv.description,
      lastMessage: conv.lastMessage ?? null,
      updatedAt: conv.updatedAt ?? null,
      unreadCount: conv.unreadCount,
    }),
  );
}

function messageRowToView(row: MessageRow): ChatMessageView {
  return {
    localId: row.localId,
    messageId: row.messageId ?? 0,
    scope: row.scope as ChatMessageView["scope"],
    sender: {
      userId: row.senderId ?? 0,
      username: row.senderUsername,
      nickname: row.senderNickname,
    },
    receiverUsername: row.receiverUsername ?? undefined,
    groupID: row.groupId ?? undefined,
    contentType: row.contentType as ChatMessageView["contentType"],
    content: row.content,
    file: row.fileJson ? (JSON.parse(row.fileJson) as ChatMessageView["file"]) : undefined,
    timestamp: row.timestamp,
    deliveryStatus: row.deliveryStatus as ChatMessageView["deliveryStatus"],
    clientRequestId: row.clientRequestId ?? undefined,
    error: row.error ?? undefined,
  };
}

async function loadLocalMessages(): Promise<{
  messagesByConversation: Record<string, ChatMessageView[]>;
  conversations: Record<string, Conversation>;
} | null> {
  const convs = await dbGetConversations();
  if (convs.length === 0) return null;

  const messagesByConversation: Record<string, ChatMessageView[]> = {};
  const conversations: Record<string, Conversation> = {};

  for (const dbConv of convs) {
    const cid = dbConv.id;
    const rows = await dbGetMessages(cid, undefined, 50);
    if (rows.length === 0) continue;

    const views = rows
      .map(messageRowToView)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
    messagesByConversation[cid] = views;

    const last = views[views.length - 1];
    conversations[cid] = {
      id: cid,
      scope: dbConv.scope as Conversation["scope"],
      title: dbConv.title,
      peerUsername: dbConv.peerUsername,
      description: dbConv.description,
      lastMessage: last.content,
      updatedAt: last.timestamp,
      unreadCount: dbConv.unreadCount,
      groupID: dbConv.groupId ?? undefined,
      memberCount: dbConv.scope === "group" ? dbConv.unreadCount : undefined,
    };
  }

  if (!messagesByConversation[publicConversationId]) {
    messagesByConversation[publicConversationId] = initialMessages;
    conversations[publicConversationId] = publicConversation(initialMessages);
  }

  return { messagesByConversation, conversations };
}

function isUnauthorizedError(err: unknown) {
  return (
    err instanceof APIClientError &&
    (err.status === 401 || err.code === "unauthorized")
  );
}

function trimArchiveMessages(
  messagesByConversation: Record<string, ChatMessageView[]>,
) {
  return Object.fromEntries(
    Object.entries(messagesByConversation).map(([conversationId, messages]) => [
      conversationId,
      messages.slice(-MAX_ARCHIVE_MESSAGES_PER_CONVERSATION),
    ]),
  );
}

function buildChatArchiveSnapshot(
  state: ChatState,
): PersistedChatArchive | null {
  if (!state.currentUser) {
    return null;
  }

  return {
    version: CHAT_ARCHIVE_VERSION,
    cachedAt: new Date().toISOString(),
    username: state.currentUser.username,
    activeConversationId: state.activeConversationId,
    messagesByConversation: trimArchiveMessages(state.messagesByConversation),
    conversations: state.conversations,
    historyCursors: state.historyCursors,
    scrollPositions: state.scrollPositions,
    historyTarget: state.historyTarget,
  };
}

function restoreChatArchiveSnapshot(
  snapshot: PersistedChatArchive | null,
): Pick<
  ChatState,
  | "activeConversationId"
  | "messagesByConversation"
  | "conversations"
  | "historyCursors"
  | "scrollPositions"
  | "historyTarget"
> | null {
  if (
    !snapshot ||
    snapshot.version !== CHAT_ARCHIVE_VERSION ||
    typeof snapshot !== "object" ||
    !snapshot.messagesByConversation ||
    !snapshot.conversations
  ) {
    return null;
  }

  const publicMessages =
    snapshot.messagesByConversation[publicConversationId] ?? initialMessages;
  const conversations: Record<string, Conversation> = {
    ...snapshot.conversations,
    [publicConversationId]:
      snapshot.conversations[publicConversationId] ??
      publicConversation(publicMessages),
  };
  const activeConversationId = conversations[snapshot.activeConversationId]
    ? snapshot.activeConversationId
    : publicConversationId;

  return {
    activeConversationId,
    messagesByConversation: {
      ...snapshot.messagesByConversation,
      [publicConversationId]: publicMessages,
    },
    conversations,
    historyCursors: snapshot.historyCursors ?? {},
    scrollPositions: snapshot.scrollPositions ?? {},
    historyTarget: snapshot.historyTarget ?? "",
  };
}

function mergeConversationState(
  base: Record<string, Conversation>,
  archived?: Record<string, Conversation>,
) {
  if (!archived) {
    return base;
  }

  const merged = { ...archived };
  for (const [conversationId, conversation] of Object.entries(base)) {
    const cached = archived[conversationId];
    merged[conversationId] = cached
      ? {
          ...cached,
          ...conversation,
          lastMessage: cached.lastMessage ?? conversation.lastMessage,
          updatedAt: cached.updatedAt ?? conversation.updatedAt,
          unreadCount: cached.unreadCount,
          members: cached.members ?? conversation.members,
          description: cached.description || conversation.description,
        }
      : conversation;
  }
  return merged;
}

function buildSessionConversations(
  publicMessages: ChatMessageView[],
  users: OnlineUser[],
  groups: Group[],
  currentUsername: string,
  archivedConversations?: Record<string, Conversation>,
) {
  const conversations: Record<string, Conversation> = {
    [publicConversationId]: publicConversation(publicMessages),
  };
  for (const user of users) {
    // 在线用户接口包含自己是合理的，但会话导航不应该因此生成“和自己私聊”。
    if (user.username === currentUsername) continue;
    conversations[conversationIdFor("private", user.username)] =
      privateConversation(user.username, user.online, user.nickname);
  }
  for (const group of groups) {
    conversations[conversationIdFor("group", String(group.groupID))] =
      groupConversation(group);
  }
  const merged = mergeConversationState(conversations, archivedConversations);
  // 旧版本可能已经把自己的私聊写进本地归档，因此恢复时也要清理一次。
  delete merged[conversationIdFor("private", currentUsername)];
  return merged;
}

function buildSessionStateFromServer(
  publicMessages: ChatMessageView[],
  publicHistoryCursor: string | undefined,
  users: OnlineUser[],
  groups: Group[],
  currentUsername: string,
  archivedState?: ReturnType<typeof restoreChatArchiveSnapshot>,
) {
  const messagesByConversation: Record<string, ChatMessageView[]> = {
    ...(archivedState?.messagesByConversation ?? {}),
    [publicConversationId]: publicMessages,
  };
  delete messagesByConversation[conversationIdFor("private", currentUsername)];
  const conversations = buildSessionConversations(
    publicMessages,
    users,
    groups,
    currentUsername,
    archivedState?.conversations,
  );
  const historyCursors = {
    ...(archivedState?.historyCursors ?? {}),
    [publicConversationId]: publicHistoryCursor,
  };
  const activeConversationId = conversations[
    archivedState?.activeConversationId ?? publicConversationId
  ]
    ? (archivedState?.activeConversationId ?? publicConversationId)
    : publicConversationId;

  return {
    activeConversationId,
    messagesByConversation,
    historyCursors,
    conversations,
    scrollPositions: archivedState?.scrollPositions ?? {},
    historyTarget: archivedState?.historyTarget ?? "",
    onlineUsers: users.filter((user) => user.username !== currentUsername),
    groups,
  };
}

function scheduleArchivePersist(state: ChatState) {
  if (!state.currentUser) {
    return;
  }
  if (archivePersistTimer !== null) {
    window.clearTimeout(archivePersistTimer);
  }
  archivePersistTimer = window.setTimeout(() => {
    archivePersistTimer = null;
    const snapshot = buildChatArchiveSnapshot(useChatStore.getState());
    if (!snapshot) {
      return;
    }
    fireAndForget(saveChatArchiveSnapshot(snapshot.username, snapshot));
  }, ARCHIVE_PERSIST_DELAY_MS);
}

function localized(key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]) {
  return t(useChatStore.getState().language, key, params);
}

function derivePeerNickname(
  messages: ChatMessageView[],
  peerUsername: string,
) {
  return messages.find((message) => message.sender.username === peerUsername)?.sender
    .nickname;
}

function expireSession(message?: string) {
  realtime.disconnect();
  fireAndForget(clearToken());
  useChatStore.setState({
    token: "",
    currentUser: null,
    status: "error",
    authExpired: true,
    error: message ?? localized("error.sessionExpired"),
    reconnectAttempt: 0,
    historyLoading: false,
  });
}

function decodeStoredUser(token: string): CurrentUser | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(padded)) as {
      userId?: number;
      username?: string;
      nickname?: string;
    };
    if (!decoded.userId || !decoded.username || !decoded.nickname) {
      return null;
    }
    return {
      userId: decoded.userId,
      username: decoded.username,
      nickname: decoded.nickname,
    };
  } catch {
    return null;
  }
}

function scheduleSendTimeout(conversationId: string, localId: string) {
  window.setTimeout(() => {
    useChatStore.setState((state) => {
      const messages = state.messagesByConversation[conversationId] ?? [];
      const changed = messages.some(
        (message) =>
          message.localId === localId && message.deliveryStatus === "sending",
      );
      if (!changed) return state;
      return {
        messagesByConversation: {
          ...state.messagesByConversation,
          [conversationId]: messages.map((message) =>
            message.localId === localId && message.deliveryStatus === "sending"
              ? { ...message, deliveryStatus: "failed", error: localized("error.noConfirmation") }
              : message,
          ),
        },
      };
    });
  }, 15_000);
}

function connectionHandlers() {
  return {
    onStatusChange: (status: RealtimeStatus) => {
      useChatStore.setState({ status });
    },
    onError: (message: string, code?: string) => {
      if (code === "unauthorized") {
        expireSession(message);
        return;
      }
      useChatStore.setState((state) => ({
        error: message,
        messagesByConversation: failSendingMessages(state.messagesByConversation, message),
      }));
    },
    onReady: (payload: { user: CurrentUser; heartbeatTimeout: string }) => {
      useChatStore.setState({
        currentUser: payload.user,
        status: "connected",
        reconnectAttempt: 0,
        error: "",
      });
    },
    onPresence: ({ user }: { user: OnlineUser }) => {
      useChatStore.setState((state) => {
        if (user.username === state.currentUser?.username) {
          const conversations = { ...state.conversations };
          delete conversations[conversationIdFor("private", user.username)];
          return {
            onlineUsers: state.onlineUsers.filter(
              (entry) => entry.username !== user.username,
            ),
            conversations,
          };
        }
        const users = state.onlineUsers
          .filter((entry) => entry.username !== user.username)
          .concat(user.online ? [user] : [])
          .sort((left, right) => left.username.localeCompare(right.username));
        const cid = conversationIdFor("private", user.username);
        const previous = state.conversations[cid];
        return {
          onlineUsers: users,
          conversations: {
            ...state.conversations,
            [cid]: {
              ...(previous ??
                privateConversation(user.username, user.online, user.nickname)),
              title: previous?.peerNickname || user.nickname || previous?.title || user.username,
              peerNickname: previous?.peerNickname || user.nickname,
              online: user.online,
            },
          },
        };
      });
    },
    onPublicMessage: (message: ChatMessage, requestId?: string) => {
      ingestRealtimeMessage(message, requestId);
    },
    onPrivateMessage: (message: ChatMessage, requestId?: string) => {
      ingestRealtimeMessage(message, requestId);
    },
    onGroupMessage: (message: ChatMessage, requestId?: string) => {
      ingestRealtimeMessage(message, requestId);
    },
    onGroupChanged: (payload: GroupChangedPayload) => {
      const { group, removedUsername } = payload;
      const cid = conversationIdFor("group", String(group.groupID));
      let shouldLoadActiveGroup = false;

      useChatStore.setState((state) => {
        const removedCurrentUser = removedUsername === state.currentUser?.username;
        if (removedCurrentUser) {
          const conversations = { ...state.conversations };
          const messagesByConversation = { ...state.messagesByConversation };
          const historyCursors = { ...state.historyCursors };
          delete conversations[cid];
          delete messagesByConversation[cid];
          delete historyCursors[cid];
          return {
            groups: state.groups.filter((entry) => entry.groupID !== group.groupID),
            conversations,
            messagesByConversation,
            historyCursors,
            activeConversationId:
              state.activeConversationId === cid
                ? publicConversationId
                : state.activeConversationId,
          };
        }

        const existing = state.conversations[cid];
        shouldLoadActiveGroup = state.activeConversationId === cid;
        return {
          groups: [
            ...state.groups.filter((entry) => entry.groupID !== group.groupID),
            group,
          ],
          conversations: {
            ...state.conversations,
            [cid]: {
              ...(existing ?? groupConversation(group)),
              ...groupConversation(group),
              members: removedUsername
                ? existing?.members?.filter(
                    (member) => member.user.username !== removedUsername,
                  )
                : existing?.members,
            },
          },
        };
      });

      // 只有正在查看这个群时才补拉历史和完整成员信息；侧栏更新只依赖事件负载。
      if (shouldLoadActiveGroup) {
        fireAndForget(useChatStore.getState().loadGroupHistory(group.groupID));
      }
    },
    onProfileChanged: ({ profile }: { profile: ProfileData }) => {
      useChatStore.setState((state) => {
        const username = profile.user.username;
        const existingProfile = state.profilesByUsername[username];
        const mergedProfile: ProfileData = {
          ...profile,
          ...(existingProfile?.email ? { email: existingProfile.email } : {}),
        };
        const patchUser = <T extends CurrentUser>(user: T): T =>
          user.username === username
            ? { ...user, ...profile.user }
            : user;
        const messagesByConversation = Object.fromEntries(
          Object.entries(state.messagesByConversation).map(([id, messages]) => [
            id,
            messages.map((message) => ({
              ...message,
              sender: patchUser(message.sender),
            })),
          ]),
        );
        const conversations = Object.fromEntries(
          Object.entries(state.conversations).map(([id, conversation]) => [
            id,
            {
              ...conversation,
              ...(conversation.peerUsername === username
                ? { title: profile.user.nickname, peerNickname: profile.user.nickname }
                : {}),
              members: conversation.members?.map((member) => ({
                ...member,
                user: patchUser(member.user),
              })),
              ...(conversation.creatorUsername === username
                ? { creatorNickname: profile.user.nickname }
                : {}),
            },
          ]),
        );
        return {
          currentUser: state.currentUser
            ? patchUser(state.currentUser)
            : null,
          onlineUsers: state.onlineUsers.map((user) => patchUser(user)),
          messagesByConversation,
          conversations,
          profilesByUsername: {
            ...state.profilesByUsername,
            [username]: mergedProfile,
          },
        };
      });
    },
    onReconnectScheduled: (attempt: number, delayMs: number) => {
      // 重连属于持续状态，不是一次性成功通知。Composer 和标题栏会显示它，
      // 因此这里不再反复写 notice 触发 Toast 闪烁。
      void delayMs;
      useChatStore.setState({
        reconnectAttempt: attempt,
      });
    },
  };
}

function ingestRealtimeMessage(message: ChatMessage, requestId?: string) {
  useChatStore.setState((state) => {
    const peer = peerForMessage(message, state.currentUser);
    const cid = conversationIdFor(message.scope, peer);
    const incoming: ChatMessageView = {
      ...message,
      localId: `server:${message.messageId}`,
      deliveryStatus: "sent",
    };
    const prev = state.messagesByConversation[cid] ?? [];
    const next = confirmMatchingPendingMessage(prev, incoming, state.currentUser, requestId);
    const prevConv =
      state.conversations[cid] ??
      (message.scope === "public"
        ? publicConversation()
        : message.scope === "group"
          ? groupConversation({
              groupID: message.groupID ?? 0,
              groupName: `Group ${message.groupID}`,
              creator: message.sender,
              memberCount: 0,
              createdAt: message.timestamp,
            })
          : privateConversation(peer, true, message.sender.nickname));
    const isActive = state.activeConversationId === cid;
    if (
      !isActive &&
      message.content &&
      (!state.windowFocused || !state.windowVisible)
    ) {
      const title =
        message.scope === "public"
          ? "Public Lobby"
          : `${message.sender.nickname}`;
      showNotification(title, message.content);
    }
    persistMessage(incoming, cid);
    return {
      messagesByConversation: { ...state.messagesByConversation, [cid]: next },
      conversations: {
        ...state.conversations,
        [cid]: {
          ...prevConv,
          lastMessage: message.content,
          updatedAt: message.timestamp,
          unreadCount: isActive ? 0 : prevConv.unreadCount + 1,
        },
      },
    };
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  token: "",
  language: getInitialLanguage(),
  themeMode: initialThemeMode,
  resolvedTheme: initialResolvedTheme,
  loginForm: { username: "", password: "" },
  registerForm: { username: "", password: "", nickname: "" },
  currentUser: null,
  status: "idle",
  reconnectAttempt: 0,
  messagesByConversation: { [publicConversationId]: initialMessages },
  conversations: { [publicConversationId]: publicConversation(initialMessages) },
  activeConversationId: publicConversationId,
  historyCursors: {},
  historyLoading: false,
  scrollPositions: {},
  error: "",
  authExpired: false,
  notice: "",
  lastSelectedFile: "",
  historyTarget: "",
  onlineUsers: [],
  draftsByConversation: {},
  groups: [],
  profilesByUsername: {},
  newGroupName: "",
  newGroupMembers: "",
  uploadingCount: 0,
  windowFocused: true,
  windowVisible: true,
  setLanguage: (language) => {
    persistLanguage(language);
    fireAndForget(saveDesktopPreference(LANGUAGE_KEY, language));
    set({ language });
  },
  setThemeMode: (themeMode) => {
    persistThemeMode(themeMode);
    fireAndForget(saveDesktopPreference(THEME_KEY, themeMode));
    const resolvedTheme = resolveThemeMode(themeMode);
    applyResolvedTheme(resolvedTheme);
    set({ themeMode, resolvedTheme });
  },
  setResolvedTheme: (resolvedTheme) => {
    applyResolvedTheme(resolvedTheme);
    set({ resolvedTheme });
  },
  setDesktopWindowState: ({ focused, visible }) =>
    set({ windowFocused: focused, windowVisible: visible }),
  hydrateDesktopPreferences: async () => {
    const [storedLanguage, storedThemeMode] = await Promise.all([
      loadDesktopPreference(LANGUAGE_KEY),
      loadDesktopPreference(THEME_KEY),
    ]);

    const patch: Partial<ChatState> = {};
    if (storedLanguage === "zh-CN" || storedLanguage === "en-US") {
      patch.language = storedLanguage;
    }
    if (
      storedThemeMode === "system" ||
      storedThemeMode === "latte" ||
      storedThemeMode === "one-dark"
    ) {
      const resolvedTheme = resolveThemeMode(storedThemeMode);
      applyResolvedTheme(resolvedTheme);
      patch.themeMode = storedThemeMode;
      patch.resolvedTheme = resolvedTheme;
    }
    if (Object.keys(patch).length > 0) {
      set(patch);
    }
  },

  setLoginForm: (patch) =>
    set((state) => ({ loginForm: { ...state.loginForm, ...patch } })),
  setRegisterForm: (patch) =>
    set((state) => ({ registerForm: { ...state.registerForm, ...patch } })),
  setHistoryTarget: (historyTarget) => set({ historyTarget }),
  setDraft: (draft) =>
    set((state) => ({
      draftsByConversation: {
        ...state.draftsByConversation,
        [state.activeConversationId]: draft,
      },
    })),
  setLastSelectedFile: (lastSelectedFile) => set({ lastSelectedFile }),
  setNewGroupName: (newGroupName) => set({ newGroupName }),
  setNewGroupMembers: (newGroupMembers) => set({ newGroupMembers }),
  setConversationScrollTop: (conversationId, scrollTop) =>
    set((state) => ({
      scrollPositions: { ...state.scrollPositions, [conversationId]: scrollTop },
    })),

  // ── Auth ──
  login: async () => {
    set({ error: "", authExpired: false, notice: "", reconnectAttempt: 0 });
    try {
      const response = await api.login(get().loginForm);

      // 优先从 SQLite 加载本地消息，fallback 到 JSON blob archive
      let localState = await loadLocalMessages();
      if (!localState) {
        const archived = restoreChatArchiveSnapshot(
          await loadChatArchiveSnapshot<PersistedChatArchive>(response.user.username),
        );
        if (archived) {
          localState = {
            messagesByConversation: archived.messagesByConversation,
            conversations: archived.conversations,
          };
        }
      }

      const [historyPage, users, groups] = await Promise.all([
        api.getPublicHistoryPage(response.token),
        api.getOnlineUsers(response.token),
        api.listGroups(response.token),
      ]);
      const publicMessages = normalizeMessages(historyPage.data);

      set({
        token: response.token,
        currentUser: response.user,
        ...buildSessionStateFromServer(
          publicMessages,
          historyPage.nextCursor,
          users,
          groups,
          response.user.username,
          localState
            ? {
                activeConversationId: publicConversationId,
                messagesByConversation: localState.messagesByConversation,
                conversations: localState.conversations,
                historyCursors: {},
                scrollPositions: {},
                historyTarget: "",
              }
            : undefined,
        ),
      });

      fireAndForget(saveToken(response.token));

      realtime.connect(response.token, connectionHandlers(), {
        maxReconnectAttempts: 6,
        reconnectBaseDelayMs: 900,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t(get().language, "error.loginFailed");
      set({ error: message, status: "error" });
    }
  },
  register: async () => {
    set({ error: "", authExpired: false, notice: "" });
    try {
      await api.register(get().registerForm);
      const { username, password } = get().registerForm;
      set({
        notice: t(get().language, "notice.registered"),
        loginForm: { username, password },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : t(get().language, "error.registerFailed");
      set({ error: message });
    }
  },
  logout: async () => {
    // 先主动关闭实时连接，避免清空身份后旧 WebSocket 仍把事件写回 store。
    // 内存状态必须先清空，不能让 Keychain 等外部存储的失败把 UI 卡在半退出状态。
    realtime.disconnect();
    set({
      token: "",
      currentUser: null,
      status: "idle",
      reconnectAttempt: 0,
      messagesByConversation: { [publicConversationId]: initialMessages },
      conversations: { [publicConversationId]: publicConversation(initialMessages) },
      activeConversationId: publicConversationId,
      historyCursors: {},
      historyLoading: false,
      scrollPositions: {},
      error: "",
      authExpired: false,
      notice: "",
      lastSelectedFile: "",
      historyTarget: "",
      onlineUsers: [],
      draftsByConversation: {},
      groups: [],
      profilesByUsername: {},
      newGroupName: "",
      newGroupMembers: "",
      uploadingCount: 0,
    });
    try {
      await clearToken();
    } catch (err) {
      // 用户已经从当前会话退出，但持久化 token 可能仍在，所以下次启动存在
      // 自动恢复的风险。把它作为登录页可见错误报告，而不是重新恢复登录态。
      set({
        error: t(get().language, "error.clearLogoutCredential", {
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
    }
  },

  // ── Realtime ──
  reconnect: () => {
    const { token } = get();
    if (!token) {
      set({ error: t(get().language, "error.loginBeforeReconnect") });
      return;
    }
    set({ error: "", notice: t(get().language, "notice.manualReconnect"), reconnectAttempt: 0 });
    realtime.connect(token, connectionHandlers(), {
      maxReconnectAttempts: 6,
      reconnectBaseDelayMs: 900,
    });
  },
  disconnect: () => {
    realtime.disconnect();
    set({ status: "closed", reconnectAttempt: 0 });
  },

  // ── History ──
  loadPublicHistory: async () => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeHistory") }); return; }
    try {
      set({ error: "", historyLoading: true });
      const history = await api.getPublicHistoryPage(token);
      const messages = normalizeMessages(history.data);
      set((state) => ({
        activeConversationId: publicConversationId,
        historyLoading: false,
        messagesByConversation: { ...state.messagesByConversation, [publicConversationId]: messages },
        historyCursors: { ...state.historyCursors, [publicConversationId]: history.nextCursor },
        conversations: { ...state.conversations, [publicConversationId]: publicConversation(messages) },
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.loadPublicHistory"), historyLoading: false });
    }
  },
  loadPrivateHistory: async (username) => {
    const { token, historyTarget, conversations, onlineUsers } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforePrivateHistory") }); return; }
    const peer = (username ?? historyTarget).trim();
    if (!peer) { set({ error: t(get().language, "error.enterPrivateUsername") }); return; }
    try {
      set({ error: "", historyLoading: true });
      const history = await api.getPrivateHistoryPage(token, peer);
      const messages = normalizeMessages(history.data);
      const cid = conversationIdFor("private", peer);
      const lastMessage = messages.at(-1);
      const peerNickname =
        derivePeerNickname(messages, peer) ??
        onlineUsers.find((user) => user.username === peer)?.nickname ??
        conversations[cid]?.peerNickname;
      set((state) => ({
        activeConversationId: cid,
        historyLoading: false,
        historyTarget: peer,
        messagesByConversation: { ...state.messagesByConversation, [cid]: messages },
        historyCursors: { ...state.historyCursors, [cid]: history.nextCursor },
        conversations: {
          ...state.conversations,
          [cid]: {
            ...(state.conversations[cid] ??
              privateConversation(peer, undefined, peerNickname)),
            title: peerNickname || state.conversations[cid]?.title || peer,
            peerNickname,
            lastMessage: lastMessage?.content,
            updatedAt: lastMessage?.timestamp,
            unreadCount: 0,
          },
        },
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.loadPrivateHistory"), historyLoading: false });
    }
  },
  loadOlderHistory: async () => {
    const state = get();
    const cursor = state.historyCursors[state.activeConversationId];
    if (!state.token || !cursor) return;
    const view = activeView(state.activeConversationId);
    try {
      set({ error: "", historyLoading: true });
      let history;
      if (view.scope === "public") history = await api.getPublicHistoryPage(state.token, cursor);
      else if (view.scope === "group") history = await api.getGroupHistoryPage(state.token, view.groupID!, cursor);
      else history = await api.getPrivateHistoryPage(state.token, view.peer, cursor);
      const olderMessages = normalizeMessages(history.data);
      set((current) => ({
        historyLoading: false,
        messagesByConversation: {
          ...current.messagesByConversation,
          [state.activeConversationId]: mergeMessages(olderMessages, current.messagesByConversation[state.activeConversationId] ?? []),
        },
        historyCursors: { ...current.historyCursors, [state.activeConversationId]: history.nextCursor },
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.loadOlder"), historyLoading: false });
    }
  },
  reloadActiveHistory: async () => {
    const view = activeView(get().activeConversationId);
    if (view.scope === "public") { await get().loadPublicHistory(); return; }
    if (view.scope === "group") { await get().loadGroupHistory(view.groupID!); return; }
    await get().loadPrivateHistory(view.peer);
  },

  // ── Conversations ──
  openPrivateConversation: async (username, options) => {
    if (username === get().currentUser?.username) return;
    const cid = conversationIdFor("private", username);
    const shouldPreloadHistory = options?.preloadHistory === true;
    set((state) => {
      const existing = state.conversations[cid];
      if (existing) {
        return {
          activeConversationId: cid,
          historyTarget: username,
          conversations: { ...state.conversations, [cid]: { ...existing, unreadCount: 0 } },
        };
      }
      const onlineUser = state.onlineUsers.find((u) => u.username === username);
      return {
        activeConversationId: cid,
        historyTarget: username,
        conversations: {
          ...state.conversations,
          [cid]: {
            id: cid,
            scope: "private" as const,
            title: onlineUser?.nickname || username,
            peerUsername: username,
            peerNickname: onlineUser?.nickname,
            description: t(state.language, "conv.emptyPrivate", { name: username }),
            unreadCount: 0,
            online: onlineUser?.online,
            kindLabel: "private",
          },
        },
      };
    });
    if (shouldPreloadHistory) {
      await get().loadPrivateHistory(username);
    }
  },
  openConversation: (conversationId) => {
    set((state) => {
      const conversation = state.conversations[conversationId];
      if (!conversation) return state;
      return {
        activeConversationId: conversationId,
        historyTarget: conversation.scope === "private" ? conversation.peerUsername : state.historyTarget,
        conversations: { ...state.conversations, [conversationId]: { ...conversation, unreadCount: 0 } },
      };
    });
  },
  refreshOnlineUsers: async () => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeHistory") }); return; }
    try {
      set({ error: "" });
      const users = (await api.getOnlineUsers(token)).filter(
        (user) => user.username !== get().currentUser?.username,
      );
      set((state) => {
        const conversations = users.reduce<Record<string, Conversation>>((acc, user) => {
          const cid = conversationIdFor("private", user.username);
          const previous = state.conversations[cid];
          acc[cid] = {
            ...(previous ??
              privateConversation(user.username, user.online, user.nickname)),
            title: previous?.peerNickname || user.nickname || previous?.title || user.username,
            peerNickname: previous?.peerNickname || user.nickname,
            online: user.online,
          };
          return acc;
        }, { ...state.conversations });
        if (state.currentUser) {
          delete conversations[
            conversationIdFor("private", state.currentUser.username)
          ];
        }
        return {
          onlineUsers: users,
          conversations,
          notice: t(state.language, "notice.presenceRefreshed", { count: users.length }),
        };
      });
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.refreshUsers") });
    }
  },

  // ── Messaging ──
  sendMessage: async () => {
    const state = get();
    // 捕获“点击发送”这一刻的会话。WebSocket 发送和 Zustand 更新之间存在异步边界，
    // 用户可能在这期间切换会话，所以后面不能再用 current.activeConversationId。
    const activeConversationId = state.activeConversationId;
    const content = (
      state.draftsByConversation[activeConversationId] ?? ""
    ).trim();
    if (!content) return;
    if (!state.token || state.status !== "connected" || !state.currentUser) {
      set({ error: t(state.language, "error.connectBeforeSend") });
      return;
    }
    const view = activeView(activeConversationId);
    if (view.scope === "private" && !view.peer) {
      set({ error: t(state.language, "error.choosePrivate") });
      return;
    }
    if (view.scope === "group" && !view.groupID) {
      set({ error: t(state.language, "error.selectGroup") });
      return;
    }

    const requestId = `req-${crypto.randomUUID()}`;
    const optimistic = createOptimisticMessage(content, state.currentUser, view, requestId);
    const cid = conversationIdFor(view.scope, view.peer);
    let sent: boolean;
    if (view.scope === "public") {
      sent = await Promise.resolve(
        realtime.sendPublicMessage({ content }, requestId),
      );
    } else if (view.scope === "group") {
      sent = await Promise.resolve(
        realtime.sendGroupMessage({ groupID: view.groupID!, content }, requestId),
      );
    } else {
      sent = await Promise.resolve(
        realtime.sendPrivateMessage(
          { receiverUsername: view.peer, content },
          requestId,
        ),
      );
    }

    // 在 set 回调内原子性地检查当前会话的草稿，防止并发发送重复消费同一内容。
    // 草稿按会话保存，切换聊天时不会把上一位用户的内容带到新会话。
    set((current) => {
      const currentDraft = (
        current.draftsByConversation[activeConversationId] ?? ""
      ).trim();
      if (currentDraft !== content) return current;
      return {
        error: sent ? "" : t(current.language, "error.socketNotReady"),
        draftsByConversation: sent
          ? {
              ...current.draftsByConversation,
              [activeConversationId]: "",
            }
          : current.draftsByConversation,
        messagesByConversation: {
          ...current.messagesByConversation,
          [cid]: mergeMessages(current.messagesByConversation[cid] ?? [], [
            { ...optimistic, deliveryStatus: sent ? "sending" : "failed", error: sent ? undefined : t(current.language, "error.socketNotOpen") },
          ]),
        },
        conversations: {
          ...current.conversations,
          [cid]: {
            ...(current.conversations[cid] ??
              (view.scope === "public"
                ? publicConversation()
                : view.scope === "group"
                  ? groupConversation({ groupID: view.groupID!, groupName: `Group ${view.groupID}`, creator: state.currentUser ?? { userId: 0, username: "unknown", nickname: "Unknown" }, memberCount: 0, createdAt: optimistic.timestamp })
                  : privateConversation(view.peer))),
            lastMessage: content,
            updatedAt: optimistic.timestamp,
          },
        },
      };
    });
    if (sent) {
      scheduleSendTimeout(cid, optimistic.localId);
      persistMessage(
        { ...optimistic, deliveryStatus: "sending" },
        cid,
      );
    }
  },
  retryMessage: async (localId) => {
    const state = get();
    const cid = state.activeConversationId;
    const messages = state.messagesByConversation[cid] ?? [];
    const message = messages.find((entry) => entry.localId === localId);
    if (!message || message.deliveryStatus !== "failed") return;
    const view = activeView(cid);
    if (!state.currentUser || state.status !== "connected") {
      set({ error: t(state.language, "error.reconnectBeforeRetry") });
      return;
    }

    const requestId = `req-${crypto.randomUUID()}`;
    const retry = createOptimisticMessage(message.content, state.currentUser, view, requestId);
    let sent: boolean;
    if (view.scope === "public") {
      sent = await Promise.resolve(
        realtime.sendPublicMessage({ content: message.content }, requestId),
      );
    } else if (view.scope === "group") {
      sent = await Promise.resolve(
        realtime.sendGroupMessage(
          { groupID: view.groupID!, content: message.content },
          requestId,
        ),
      );
    } else {
      sent = await Promise.resolve(
        realtime.sendPrivateMessage(
          { receiverUsername: view.peer, content: message.content },
          requestId,
        ),
      );
    }

    set((current) => ({
      error: sent ? "" : t(current.language, "error.socketNotReady"),
      messagesByConversation: {
        ...current.messagesByConversation,
        [cid]: mergeMessages(
          (current.messagesByConversation[cid] ?? []).filter((entry) => entry.localId !== localId),
          [{ ...retry, deliveryStatus: sent ? "sending" : "failed", error: sent ? undefined : t(current.language, "error.socketNotOpen") }],
        ),
      },
    }));
    if (sent) scheduleSendTimeout(cid, retry.localId);
  },

  // ── Group ──
  createGroup: async () => {
    const { token, newGroupName, newGroupMembers } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeCreateGroup") }); return; }
    const name = newGroupName.trim();
    if (!name) { set({ error: t(get().language, "error.enterGroupName") }); return; }
    try {
      set({ error: "" });
      const members = newGroupMembers.split(",").map((s) => s.trim()).filter(Boolean);
      const response = await api.createGroup(token, { groupName: name, members: members.length > 0 ? members : undefined });
      const group = response.group;
      const cid = conversationIdFor("group", String(group.groupID));
      const conversation = groupConversation(group);
      set((state) => ({
        groups: [
          ...state.groups.filter((entry) => entry.groupID !== group.groupID),
          group,
        ],
        conversations: { ...state.conversations, [cid]: conversation },
        activeConversationId: cid,
        newGroupName: "",
        newGroupMembers: "",
        notice: t(state.language, "notice.groupCreated", { name: group.groupName }),
      }));
      // 创建接口已返回群资料，所以侧栏可以立即更新；成员和历史在后台补齐，
      // 不阻塞模态框关闭，也不再要求用户点一次“刷新”。
      fireAndForget(get().loadGroupHistory(group.groupID));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.createGroup") });
    }
  },
  loadGroups: async () => {
    const { token } = get();
    if (!token) return;
    try {
      const groups = await api.listGroups(token);
      set((state) => {
        const conversations = { ...state.conversations };
        for (const group of groups) {
          const cid = conversationIdFor("group", String(group.groupID));
          conversations[cid] = conversations[cid]
            ? { ...conversations[cid], ...groupConversation(group) }
            : groupConversation(group);
        }
        return { groups, conversations };
      });
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.loadGroups") });
    }
  },
  loadGroupHistory: async (groupID) => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeGroupHistory") }); return; }
    try {
      set({ error: "", historyLoading: true });
      const [history, members] = await Promise.all([
        api.getGroupHistoryPage(token, groupID),
        api.getGroupMembers(token, groupID),
      ]);
      const messages = normalizeMessages(history.data);
      const cid = conversationIdFor("group", String(groupID));
      const lastMessage = messages.at(-1);
      set((state) => {
        const existing = state.conversations[cid];
        return {
          // 加载历史只更新目标群的缓存，不能顺便执行导航。
          // 请求期间用户可能已经切换到其他会话；如果这里重新写入 cid，
          // 较晚返回的后台请求就会把界面强行切回这个群。
          historyLoading: false,
          messagesByConversation: { ...state.messagesByConversation, [cid]: messages },
          historyCursors: { ...state.historyCursors, [cid]: history.nextCursor },
          conversations: {
            ...state.conversations,
            [cid]: {
              ...(existing ?? groupConversation({ groupID, groupName: `Group ${groupID}`, creator: state.currentUser!, memberCount: members.length, createdAt: "" })),
              members,
              memberCount: members.length,
              lastMessage: lastMessage?.content,
              updatedAt: lastMessage?.timestamp,
              unreadCount: 0,
              description: members.length === 1 ? "1 member" : `${members.length} members`,
            },
          },
        };
      });
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.loadGroupHistory"), historyLoading: false });
    }
  },
  addGroupMembers: async (groupID, usernames) => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeManageGroup") }); return; }
    try {
      set({ error: "" });
      const members = await api.addGroupMembers(token, groupID, { usernames });
      set((state) => {
        const cid = conversationIdFor("group", String(groupID));
        const conversation = state.conversations[cid];
        return {
          notice: t(state.language, "notice.membersAdded", { count: usernames.length }),
          conversations: conversation
            ? {
                ...state.conversations,
                [cid]: { ...conversation, members, memberCount: members.length },
              }
            : state.conversations,
        };
      });
      fireAndForget(get().loadGroupHistory(groupID));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.addMembers") });
    }
  },
  removeGroupMember: async (groupID, username) => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeManageGroup") }); return; }
    try {
      set({ error: "" });
      await api.removeGroupMember(token, groupID, username);
      // 删除接口没有返回群成员列表，因此先依据已知用户名更新本地状态，
      // 让面板立即响应；随后后台拉取一次服务端数据做最终校准。
      set((state) => {
        const cid = conversationIdFor("group", String(groupID));
        const conversation = state.conversations[cid];
        const members = conversation?.members?.filter(
          (member) => member.user.username !== username,
        );
        return {
          notice: t(state.language, "notice.memberRemoved", { name: username }),
          conversations: conversation
            ? {
                ...state.conversations,
                [cid]: {
                  ...conversation,
                  members,
                  memberCount:
                    members?.length ?? Math.max(0, (conversation.memberCount ?? 0) - 1),
                },
              }
            : state.conversations,
        };
      });
      fireAndForget(get().loadGroupHistory(groupID));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : t(get().language, "error.removeMember") });
    }
  },

  // ── File ──
  uploadFile: async (file, target) => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeUpload") }); return; }
    try {
      set((s) => ({ error: "", uploadingCount: s.uploadingCount + 1, lastSelectedFile: file.name }));
      await api.uploadFile(token, file, target);
      set((s) => ({
        uploadingCount: s.uploadingCount - 1,
        lastSelectedFile: "",
        notice: t(s.language, "notice.fileUploaded", { name: file.name }),
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set((s) => ({
        error: err instanceof Error ? err.message : t(s.language, "error.uploadFile"),
        uploadingCount: s.uploadingCount - 1,
      }));
    }
  },

  uploadFileFromPath: async (filePath, target) => {
    const { token } = get();
    if (!token) { set({ error: t(get().language, "error.loginBeforeUpload") }); return; }
    // 路径只用于 Rust 侧读取文件。界面上仅显示末尾文件名，避免暴露本机目录。
    const fileName = filePath.split(/[\\/]/).pop() || filePath;
    try {
      set((state) => ({ error: "", uploadingCount: state.uploadingCount + 1, lastSelectedFile: fileName }));
      await api.uploadFileFromPath(token, filePath, target);
      set((state) => ({
        uploadingCount: state.uploadingCount - 1,
        lastSelectedFile: "",
        notice: t(state.language, "notice.fileUploaded", { name: fileName }),
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set((state) => ({
        error: err instanceof Error ? err.message : t(state.language, "error.uploadFile"),
        uploadingCount: Math.max(0, state.uploadingCount - 1),
      }));
    }
  },

  bootstrapSession: async () => {
    const storedToken = await loadToken();
    if (!storedToken) {
      return;
    }

    const storedUser = decodeStoredUser(storedToken);
    if (!storedUser) {
      await clearToken();
      return;
    }

    let localState = await loadLocalMessages();
    if (!localState) {
      const archived = restoreChatArchiveSnapshot(
        await loadChatArchiveSnapshot<PersistedChatArchive>(storedUser.username),
      );
      if (archived) {
        localState = {
          messagesByConversation: archived.messagesByConversation,
          conversations: archived.conversations,
        };
      }
    }

    set({
      token: storedToken,
      currentUser: storedUser,
      authExpired: false,
      error: "",
      ...(localState ?? {}),
      notice: localState
        ? t(get().language, "notice.localArchiveLoaded")
        : t(get().language, "notice.restoreSession"),
      reconnectAttempt: 0,
    });

    try {
      const [historyPage, users, groups] = await Promise.all([
        api.getPublicHistoryPage(storedToken),
        api.getOnlineUsers(storedToken),
        api.listGroups(storedToken),
      ]);
      const publicMessages = normalizeMessages(historyPage.data);

      set({
        ...buildSessionStateFromServer(
          publicMessages,
          historyPage.nextCursor,
          users,
          groups,
          storedUser.username,
          localState
            ? {
                activeConversationId: publicConversationId,
                messagesByConversation: localState.messagesByConversation,
                conversations: localState.conversations,
                historyCursors: {},
                scrollPositions: {},
                historyTarget: "",
              }
            : undefined,
        ),
        notice: t(get().language, "notice.sessionRestored"),
      });

      realtime.connect(storedToken, connectionHandlers(), {
        maxReconnectAttempts: 6,
        reconnectBaseDelayMs: 900,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        expireSession();
        return;
      }
      set({
        error: err instanceof Error ? err.message : t(get().language, "error.restoreSession"),
        notice: localState
          ? t(get().language, "notice.localArchiveLoaded")
          : "",
      });
    }
  },

  clearError: () => set({ error: "", authExpired: false }),
  clearNotice: () => set({ notice: "" }),
  clearFeedback: () => set({ error: "", authExpired: false, notice: "" }),
}));

useChatStore.subscribe((state, previous) => {
  if (
    state.currentUser?.username !== previous.currentUser?.username ||
    state.activeConversationId !== previous.activeConversationId ||
    state.historyTarget !== previous.historyTarget ||
    state.messagesByConversation !== previous.messagesByConversation ||
    state.conversations !== previous.conversations ||
    state.historyCursors !== previous.historyCursors ||
    state.scrollPositions !== previous.scrollPositions ||
    state.groups !== previous.groups
  ) {
    scheduleArchivePersist(state);
  }
});

export { publicConversation };

export function selectActiveMessages(state: ChatState) {
  return state.messagesByConversation[state.activeConversationId] ?? [];
}

export function selectActiveConversation(state: ChatState) {
  return (
    state.conversations[state.activeConversationId] ??
    publicConversation(state.messagesByConversation[publicConversationId] ?? [])
  );
}

export function selectConversationList(state: ChatState) {
  return sortedConversationList(state.conversations, state.currentUser?.username);
}

export function selectActiveStats(state: ChatState) {
  const messages = selectActiveMessages(state);
  return {
    sendingCount: messages.filter((message) => message.deliveryStatus === "sending").length,
    failedCount: messages.filter((message) => message.deliveryStatus === "failed").length,
  };
}
