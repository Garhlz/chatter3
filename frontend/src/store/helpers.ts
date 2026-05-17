import type { CurrentUser, ChatMessage, Group } from "../protocol";

export type ConversationScope = "public" | "private" | "group";
export type DeliveryStatus = "sent" | "sending" | "failed";

export type Conversation = {
  id: string;
  scope: ConversationScope;
  title: string;
  peerUsername: string;
  peerNickname?: string;
  description: string;
  lastMessage?: string;
  updatedAt?: string;
  unreadCount: number;
  online?: boolean;
  groupID?: number;
  memberCount?: number;
  members?: import("../protocol").GroupMember[];
  creatorUsername?: string;
  creatorNickname?: string;
  kindLabel?: "public" | "private" | "group";
};

export type ChatMessageView = ChatMessage & {
  localId: string;
  clientRequestId?: string;
  deliveryStatus: DeliveryStatus;
  error?: string;
};

export type HistoryView = {
  scope: ConversationScope;
  peer: string;
  groupID?: number;
};

export const publicConversationId = "public";

export function conversationIdFor(scope: ConversationScope, peer = "") {
  if (scope === "public") return publicConversationId;
  if (scope === "group") return `group:${peer}`;
  return `private:${peer}`;
}

export function privateConversation(
  username: string,
  online?: boolean,
  nickname?: string,
): Conversation {
  return {
    id: conversationIdFor("private", username),
    scope: "private",
    title: nickname || username,
    peerUsername: username,
    peerNickname: nickname,
    description: `@${username}`,
    unreadCount: 0,
    online,
    kindLabel: "private",
  };
}

export function groupConversation(group: Group): Conversation {
  return {
    id: conversationIdFor("group", String(group.groupID)),
    scope: "group",
    title: group.groupName,
    peerUsername: "",
    description: `${group.memberCount} members · created by @${group.creator.username}`,
    unreadCount: 0,
    groupID: group.groupID,
    memberCount: group.memberCount,
    creatorUsername: group.creator.username,
    creatorNickname: group.creator.nickname,
    kindLabel: "group",
  };
}

export function publicConversation(
  messages: ChatMessageView[] = [],
): Conversation {
  const lastMessage = messages.at(-1);
  return {
    id: publicConversationId,
    scope: "public",
    title: "Public Lobby",
    peerUsername: "",
    description: "Shared broadcast channel",
    lastMessage: lastMessage?.content,
    updatedAt: lastMessage?.timestamp,
    unreadCount: 0,
    online: true,
    kindLabel: "public",
  };
}

export function activeView(activeConversationId: string): HistoryView {
  if (activeConversationId === publicConversationId) {
    return { scope: "public", peer: "" };
  }
  if (activeConversationId.startsWith("group:")) {
    const groupID = Number(activeConversationId.replace(/^group:/, ""));
    return { scope: "group", peer: String(groupID), groupID };
  }
  return {
    scope: "private",
    peer: activeConversationId.replace(/^private:/, ""),
  };
}

export function peerForMessage(
  message: ChatMessage,
  currentUser: CurrentUser | null,
) {
  if (message.scope === "public") return "";
  if (message.scope === "group") return String(message.groupID ?? "");
  if (
    currentUser?.username &&
    message.sender.username === currentUser.username
  ) {
    return message.receiverUsername ?? "";
  }
  return message.sender.username;
}

export function normalizeMessages(messages: ChatMessage[]): ChatMessageView[] {
  return messages.map((message) => ({
    ...message,
    localId: `server:${message.messageId}`,
    deliveryStatus: "sent" as const,
  }));
}

export function mergeMessages(
  currentMessages: ChatMessageView[],
  incomingMessages: ChatMessageView[],
) {
  const seen = new Set<string>();
  const merged = [...currentMessages, ...incomingMessages].filter((message) => {
    const key =
      message.messageId > 0
        ? `server:${message.messageId}`
        : message.clientRequestId ?? message.localId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return merged.sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
  );
}

export function createOptimisticMessage(
  content: string,
  currentUser: CurrentUser,
  view: HistoryView,
  clientRequestId: string,
): ChatMessageView {
  return {
    localId: `local:${clientRequestId}`,
    clientRequestId,
    deliveryStatus: "sending",
    messageId: -Date.now(),
    scope: view.scope,
    sender: currentUser,
    receiverUsername: view.scope === "private" ? view.peer : undefined,
    groupID: view.scope === "group" ? view.groupID : undefined,
    contentType: "text",
    content,
    timestamp: new Date().toISOString(),
  };
}

export function confirmMatchingPendingMessage(
  messages: ChatMessageView[],
  incoming: ChatMessageView,
  currentUser: CurrentUser | null,
  requestId?: string,
) {
  if (requestId) {
    const matchIndex = messages.findIndex(
      (message) => message.clientRequestId === requestId,
    );
    if (matchIndex !== -1) {
      const updated = [...messages];
      updated[matchIndex] = {
        ...incoming,
        clientRequestId: requestId,
        deliveryStatus: "sent",
      };
      return mergeMessages(updated, []);
    }
  }

  const incomingTime = new Date(incoming.timestamp).getTime();
  const matchIndex = messages.findIndex((message) => {
    if (message.deliveryStatus !== "sending") return false;
    if (!currentUser || incoming.sender.username !== currentUser.username)
      return false;
    if (message.content !== incoming.content || message.scope !== incoming.scope)
      return false;
    if (message.receiverUsername !== incoming.receiverUsername) return false;
    if (message.groupID !== incoming.groupID) return false;
    const pendingTime = new Date(message.timestamp).getTime();
    return Math.abs(incomingTime - pendingTime) < 20_000;
  });

  if (matchIndex === -1) {
    return mergeMessages(messages, [incoming]);
  }

  const updated = [...messages];
  updated[matchIndex] = {
    ...incoming,
    clientRequestId: messages[matchIndex].clientRequestId,
    deliveryStatus: "sent",
  };
  return mergeMessages(updated, []);
}

export function failSendingMessages(
  messagesByConversation: Record<string, ChatMessageView[]>,
  reason: string,
): Record<string, ChatMessageView[]> {
  return Object.fromEntries(
    Object.entries(messagesByConversation).map(([conversationId, messages]) => [
      conversationId,
      messages.map((message) =>
        message.deliveryStatus === "sending"
          ? { ...message, deliveryStatus: "failed" as const, error: reason }
          : message,
      ),
    ]),
  );
}
