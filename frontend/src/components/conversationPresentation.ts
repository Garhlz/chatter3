import { t, type Language } from "../i18n";
import type { Conversation } from "../store/helpers";

export function conversationDisplayTitle(conversation: Conversation) {
  if (conversation.scope === "public") {
    return conversation.title;
  }
  if (conversation.scope === "private") {
    return conversation.peerNickname || conversation.title || conversation.peerUsername;
  }
  return conversation.title;
}

export function conversationStaticSummary(
  language: Language,
  conversation: Conversation,
) {
  if (conversation.scope === "public") {
    return t(language, "conv.publicSummary");
  }
  if (conversation.scope === "private") {
    return t(language, "conv.emptyPrivate", {
      name: conversation.peerUsername,
    });
  }
  return t(language, "conv.groupSummary", {
    count: conversation.memberCount ?? 0,
    creator: conversation.creatorUsername ?? "unknown",
  });
}

export function conversationListSecondaryText(
  language: Language,
  conversation: Conversation,
) {
  return conversation.lastMessage ?? conversationStaticSummary(language, conversation);
}

export function conversationScopeLabel(
  language: Language,
  conversation: Conversation,
) {
  if (conversation.scope === "public") {
    return t(language, "chat.lobby");
  }
  if (conversation.scope === "group") {
    return t(language, "chat.group");
  }
  return t(language, "chat.direct");
}

export function conversationIsEmptyShell(conversation: Conversation) {
  return (
    conversation.scope === "private" &&
    !conversation.lastMessage &&
    !conversation.updatedAt
  );
}
