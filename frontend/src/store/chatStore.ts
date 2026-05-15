import { create } from "zustand";
import { createAPIClient, APIClientError } from "../api/client";
import { httpBaseURL, wsBaseURL } from "../config";
import { saveToken, clearToken, loadToken, showNotification } from "../desktop";
import { createRealtimeClient, type RealtimeStatus } from "../realtime/client";
import type {
  ChatMessage,
  CurrentUser,
  Group,
  GroupMember,
  LoginRequest,
  OnlineUser,
  RegisterRequest,
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
} from "./helpers";
import type { ChatMessageView, Conversation, ConversationScope, HistoryView } from "./helpers";

type ChatState = {
  token: string;
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
  draft: string;
  groups: Group[];
  newGroupName: string;
  newGroupMembers: string;
  uploadingFile: boolean;
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
  loadPublicHistory: () => Promise<void>;
  loadPrivateHistory: (username?: string) => Promise<void>;
  loadOlderHistory: () => Promise<void>;
  openConversation: (conversationId: string) => void;
  reloadActiveHistory: () => Promise<void>;
  refreshOnlineUsers: () => Promise<void>;
  reconnect: () => void;
  sendMessage: () => void;
  retryMessage: (localId: string) => void;
  disconnect: () => void;
  clearError: () => void;
  createGroup: () => Promise<void>;
  loadGroups: () => Promise<void>;
  loadGroupHistory: (groupID: number) => Promise<void>;
  addGroupMembers: (groupID: number, usernames: string[]) => Promise<void>;
  removeGroupMember: (groupID: number, username: string) => Promise<void>;
  uploadFile: (file: File, receiverUsername?: string) => Promise<void>;
  bootstrapSession: () => Promise<void>;
};

const api = createAPIClient(httpBaseURL);
const realtime = createRealtimeClient(wsBaseURL);

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

function isUnauthorizedError(err: unknown) {
  return (
    err instanceof APIClientError &&
    (err.status === 401 || err.code === "unauthorized")
  );
}

function expireSession(message = "Session expired. Log in again.") {
  realtime.disconnect();
  void clearToken();
  useChatStore.setState({
    token: "",
    currentUser: null,
    status: "error",
    authExpired: true,
    error: message,
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
              ? { ...message, deliveryStatus: "failed", error: "No realtime confirmation received." }
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
        notice: `Realtime session ready. Heartbeat timeout: ${payload.heartbeatTimeout}`,
      });
    },
    onPresence: ({ user }: { user: OnlineUser }) => {
      useChatStore.setState((state) => {
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
            [cid]: { ...(previous ?? privateConversation(user.username)), online: user.online },
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
    onReconnectScheduled: (attempt: number, delayMs: number) => {
      useChatStore.setState({
        reconnectAttempt: attempt,
        notice: `Realtime reconnect attempt ${attempt} scheduled in ${Math.round(delayMs / 1000)}s.`,
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
          : privateConversation(peer, true));
    const isActive = state.activeConversationId === cid;
    if (!isActive && message.content) {
      const title =
        message.scope === "public"
          ? "Public Lobby"
          : `${message.sender.nickname}`;
      showNotification(title, message.content);
    }
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
  draft: "",
  groups: [],
  newGroupName: "",
  newGroupMembers: "",
  uploadingFile: false,

  setLoginForm: (patch) =>
    set((state) => ({ loginForm: { ...state.loginForm, ...patch } })),
  setRegisterForm: (patch) =>
    set((state) => ({ registerForm: { ...state.registerForm, ...patch } })),
  setHistoryTarget: (historyTarget) => set({ historyTarget }),
  setDraft: (draft) => set({ draft }),
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
      const [historyPage, users, groups] = await Promise.all([
        api.getPublicHistoryPage(response.token),
        api.getOnlineUsers(response.token),
        api.listGroups(response.token),
      ]);
      const publicMessages = normalizeMessages(historyPage.data);
      const conversations: Record<string, Conversation> = {
        [publicConversationId]: publicConversation(publicMessages),
      };
      for (const user of users) {
        conversations[conversationIdFor("private", user.username)] =
          privateConversation(user.username, user.online);
      }
      for (const group of groups) {
        conversations[conversationIdFor("group", String(group.groupID))] =
          groupConversation(group);
      }

      set({
        token: response.token,
        currentUser: response.user,
        activeConversationId: publicConversationId,
        messagesByConversation: { [publicConversationId]: publicMessages },
        historyCursors: { [publicConversationId]: historyPage.nextCursor },
        conversations,
        onlineUsers: users,
        groups,
      });

      void saveToken(response.token);

      realtime.connect(response.token, connectionHandlers(), {
        maxReconnectAttempts: 6,
        reconnectBaseDelayMs: 900,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      set({ error: message, status: "error" });
    }
  },
  register: async () => {
    set({ error: "", authExpired: false, notice: "" });
    try {
      await api.register(get().registerForm);
      const { username, password } = get().registerForm;
      set({
        notice: "Registration succeeded. You can now log in with the new account.",
        loginForm: { username, password },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      set({ error: message });
    }
  },

  // ── Realtime ──
  reconnect: () => {
    const { token } = get();
    if (!token) {
      set({ error: "Log in before reconnecting realtime." });
      return;
    }
    set({ error: "", notice: "Manual realtime reconnect requested.", reconnectAttempt: 0 });
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
    if (!token) { set({ error: "Log in first before loading history." }); return; }
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
      set({ error: err instanceof Error ? err.message : "Failed to load public history", historyLoading: false });
    }
  },
  loadPrivateHistory: async (username) => {
    const { token, historyTarget } = get();
    if (!token) { set({ error: "Log in first before loading private history." }); return; }
    const peer = (username ?? historyTarget).trim();
    if (!peer) { set({ error: "Enter a username before loading private history." }); return; }
    try {
      set({ error: "", historyLoading: true });
      const history = await api.getPrivateHistoryPage(token, peer);
      const messages = normalizeMessages(history.data);
      const cid = conversationIdFor("private", peer);
      const lastMessage = messages.at(-1);
      set((state) => ({
        activeConversationId: cid,
        historyLoading: false,
        historyTarget: peer,
        messagesByConversation: { ...state.messagesByConversation, [cid]: messages },
        historyCursors: { ...state.historyCursors, [cid]: history.nextCursor },
        conversations: {
          ...state.conversations,
          [cid]: {
            ...(state.conversations[cid] ?? privateConversation(peer)),
            lastMessage: lastMessage?.content,
            updatedAt: lastMessage?.timestamp,
            unreadCount: 0,
          },
        },
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to load private history", historyLoading: false });
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
      set({ error: err instanceof Error ? err.message : "Failed to load older messages", historyLoading: false });
    }
  },
  reloadActiveHistory: async () => {
    const view = activeView(get().activeConversationId);
    if (view.scope === "public") { await get().loadPublicHistory(); return; }
    if (view.scope === "group") { await get().loadGroupHistory(view.groupID!); return; }
    await get().loadPrivateHistory(view.peer);
  },

  // ── Conversations ──
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
    if (!token) { set({ error: "Log in first before refreshing online users." }); return; }
    try {
      set({ error: "" });
      const users = await api.getOnlineUsers(token);
      set((state) => {
        const conversations = users.reduce<Record<string, Conversation>>((acc, user) => {
          const cid = conversationIdFor("private", user.username);
          acc[cid] = { ...(state.conversations[cid] ?? privateConversation(user.username)), online: user.online };
          return acc;
        }, { ...state.conversations });
        return { onlineUsers: users, conversations, notice: `Presence refreshed. ${users.length} users online.` };
      });
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to refresh online users" });
    }
  },

  // ── Messaging ──
  sendMessage: () => {
    const state = get();
    const content = state.draft.trim();
    if (!content) return;
    if (!state.token || state.status !== "connected" || !state.currentUser) {
      set({ error: "Connect the realtime session before sending messages." });
      return;
    }
    const view = activeView(state.activeConversationId);
    if (view.scope === "private" && !view.peer) {
      set({ error: "Choose a private conversation before sending a direct message." });
      return;
    }
    if (view.scope === "group" && !view.groupID) {
      set({ error: "Select a group before sending a message." });
      return;
    }

    const requestId = `req-${crypto.randomUUID()}`;
    const optimistic = createOptimisticMessage(content, state.currentUser, view, requestId);
    const cid = conversationIdFor(view.scope, view.peer);
    let sent: boolean;
    if (view.scope === "public") sent = realtime.sendPublicMessage({ content }, requestId);
    else if (view.scope === "group") sent = realtime.sendGroupMessage({ groupID: view.groupID!, content }, requestId);
    else sent = realtime.sendPrivateMessage({ receiverUsername: view.peer, content }, requestId);

    set((current) => ({
      error: sent ? "" : "Realtime socket is not ready.",
      draft: sent ? "" : current.draft,
      messagesByConversation: {
        ...current.messagesByConversation,
        [cid]: mergeMessages(current.messagesByConversation[cid] ?? [], [
          { ...optimistic, deliveryStatus: sent ? "sending" : "failed", error: sent ? undefined : "Socket is not open." },
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
    }));
    if (sent) scheduleSendTimeout(cid, optimistic.localId);
  },
  retryMessage: (localId) => {
    const state = get();
    const cid = state.activeConversationId;
    const messages = state.messagesByConversation[cid] ?? [];
    const message = messages.find((entry) => entry.localId === localId);
    if (!message || message.deliveryStatus !== "failed") return;
    const view = activeView(cid);
    if (!state.currentUser || state.status !== "connected") {
      set({ error: "Reconnect the realtime session before retrying messages." });
      return;
    }

    const requestId = `req-${crypto.randomUUID()}`;
    const retry = createOptimisticMessage(message.content, state.currentUser, view, requestId);
    let sent: boolean;
    if (view.scope === "public") sent = realtime.sendPublicMessage({ content: message.content }, requestId);
    else if (view.scope === "group") sent = realtime.sendGroupMessage({ groupID: view.groupID!, content: message.content }, requestId);
    else sent = realtime.sendPrivateMessage({ receiverUsername: view.peer, content: message.content }, requestId);

    set((current) => ({
      error: sent ? "" : "Realtime socket is not ready.",
      messagesByConversation: {
        ...current.messagesByConversation,
        [cid]: mergeMessages(
          (current.messagesByConversation[cid] ?? []).filter((entry) => entry.localId !== localId),
          [{ ...retry, deliveryStatus: sent ? "sending" : "failed", error: sent ? undefined : "Socket is not open." }],
        ),
      },
    }));
    if (sent) scheduleSendTimeout(cid, retry.localId);
  },

  // ── Group ──
  createGroup: async () => {
    const { token, newGroupName, newGroupMembers } = get();
    if (!token) { set({ error: "Log in before creating a group." }); return; }
    const name = newGroupName.trim();
    if (!name) { set({ error: "Enter a group name." }); return; }
    try {
      set({ error: "" });
      const members = newGroupMembers.split(",").map((s) => s.trim()).filter(Boolean);
      const response = await api.createGroup(token, { groupName: name, members: members.length > 0 ? members : undefined });
      const group = response.group;
      const cid = conversationIdFor("group", String(group.groupID));
      const conversation = groupConversation(group);
      set((state) => ({
        groups: [...state.groups, group],
        conversations: { ...state.conversations, [cid]: conversation },
        activeConversationId: cid,
        newGroupName: "",
        newGroupMembers: "",
        notice: `Group "${group.groupName}" created.`,
      }));
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to create group" });
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
      if (isUnauthorizedError(err)) expireSession();
    }
  },
  loadGroupHistory: async (groupID) => {
    const { token } = get();
    if (!token) { set({ error: "Log in before loading group history." }); return; }
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
          activeConversationId: cid,
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
              description: `${members.length} members`,
            },
          },
        };
      });
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to load group history", historyLoading: false });
    }
  },
  addGroupMembers: async (groupID, usernames) => {
    const { token } = get();
    if (!token) return;
    try {
      set({ error: "" });
      await api.addGroupMembers(token, groupID, { usernames });
      set({ notice: `Added ${usernames.length} member(s) to group.` });
      await get().loadGroupHistory(groupID);
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to add members" });
    }
  },
  removeGroupMember: async (groupID, username) => {
    const { token } = get();
    if (!token) return;
    try {
      set({ error: "" });
      await api.removeGroupMember(token, groupID, username);
      set({ notice: `Removed ${username} from group.` });
      await get().loadGroupHistory(groupID);
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to remove member" });
    }
  },

  // ── File ──
  uploadFile: async (file, receiverUsername) => {
    const { token } = get();
    if (!token) { set({ error: "Log in before uploading files." }); return; }
    try {
      set({ error: "", uploadingFile: true, lastSelectedFile: file.name });
      await api.uploadFile(token, file, receiverUsername);
      set({ uploadingFile: false, lastSelectedFile: "", notice: `File "${file.name}" uploaded.` });
    } catch (err) {
      if (isUnauthorizedError(err)) { expireSession(); return; }
      set({ error: err instanceof Error ? err.message : "Failed to upload file", uploadingFile: false });
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

    set({
      token: storedToken,
      currentUser: storedUser,
      authExpired: false,
      error: "",
      notice: "Restoring saved session…",
      reconnectAttempt: 0,
    });

    try {
      const [historyPage, users, groups] = await Promise.all([
        api.getPublicHistoryPage(storedToken),
        api.getOnlineUsers(storedToken),
        api.listGroups(storedToken),
      ]);
      const publicMessages = normalizeMessages(historyPage.data);
      const conversations: Record<string, Conversation> = {
        [publicConversationId]: publicConversation(publicMessages),
      };
      for (const user of users) {
        conversations[conversationIdFor("private", user.username)] =
          privateConversation(user.username, user.online);
      }
      for (const group of groups) {
        conversations[conversationIdFor("group", String(group.groupID))] =
          groupConversation(group);
      }

      set({
        activeConversationId: publicConversationId,
        messagesByConversation: { [publicConversationId]: publicMessages },
        historyCursors: { [publicConversationId]: historyPage.nextCursor },
        conversations,
        onlineUsers: users,
        groups,
        notice: "Saved session restored.",
      });

      realtime.connect(storedToken, connectionHandlers(), {
        maxReconnectAttempts: 6,
        reconnectBaseDelayMs: 900,
      });
    } catch (err) {
      if (isUnauthorizedError(err)) {
        expireSession("Stored session expired. Log in again.");
        return;
      }
      set({
        error: err instanceof Error ? err.message : "Failed to restore saved session",
        notice: "",
      });
    }
  },

  clearError: () => set({ error: "", authExpired: false }),
}));

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
  return Object.values(state.conversations).sort((left, right) => {
    if (left.id === publicConversationId) return -1;
    if (right.id === publicConversationId) return 1;
    return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
  });
}

export function selectActiveStats(state: ChatState) {
  const messages = selectActiveMessages(state);
  return {
    sendingCount: messages.filter((message) => message.deliveryStatus === "sending").length,
    failedCount: messages.filter((message) => message.deliveryStatus === "failed").length,
  };
}
