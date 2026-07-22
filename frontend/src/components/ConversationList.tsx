import { Hash, Search, Users, X } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { t } from "../i18n";
import { selectConversationList, useChatStore } from "../store/chatStore";
import type { Conversation } from "../store/helpers";
import {
  conversationDisplayTitle,
  conversationListSecondaryText,
} from "./conversationPresentation";
import { Avatar } from "./ui/Avatar";
import { IconButton } from "./ui/IconButton";

function conversationTime(timestamp?: string) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "numeric", day: "numeric" });
}

function ConversationAvatar({ conversation }: { conversation: Conversation }) {
  if (conversation.scope === "public") {
    return <span className="conversation-symbol"><Hash aria-hidden="true" /></span>;
  }
  if (conversation.scope === "group") {
    return <span className="conversation-symbol"><Users aria-hidden="true" /></span>;
  }
  return (
    <Avatar
      user={{
        username: conversation.peerUsername,
        nickname: conversationDisplayTitle(conversation),
      }}
      online={conversation.online}
    />
  );
}

export function ConversationList({
  onConversationOpen,
}: {
  onConversationOpen?: () => void;
}) {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore(useShallow(selectConversationList));
  const openConversation = useChatStore((state) => state.openConversation);
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = normalizedQuery
    ? conversations.filter((conversation) =>
        [
          conversationDisplayTitle(conversation),
          conversation.peerUsername,
          conversation.description,
          conversation.lastMessage ?? "",
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : conversations;

  return (
    <section className="conversation-list-section" aria-label={t(language, "conversations.title")}>
      <div className="conversation-search">
        <Search aria-hidden="true" />
        <input
          data-conversation-search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!token}
          placeholder={t(language, "conv.search")}
        />
        {query ? (
          <IconButton
            icon={X}
            label={t(language, "feedback.dismiss")}
            size="small"
            onClick={() => setQuery("")}
          />
        ) : null}
      </div>

      <div className="conversation-list">
        {filtered.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={`conversation-item ${
              activeConversationId === conversation.id ? "is-active" : ""
            }`}
            onClick={() => {
              openConversation(conversation.id);
              onConversationOpen?.();
            }}
          >
            <ConversationAvatar conversation={conversation} />
            <span className="conversation-item-copy">
              <span className="conversation-item-heading">
                <strong>{conversationDisplayTitle(conversation)}</strong>
                <time>{conversationTime(conversation.updatedAt)}</time>
              </span>
              <span className="conversation-item-preview">
                {conversationListSecondaryText(language, conversation)}
              </span>
            </span>
            {conversation.unreadCount > 0 ? (
              <span className="unread-badge">
                {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
              </span>
            ) : null}
          </button>
        ))}

        {filtered.length === 0 ? (
          <div className="conversation-empty">
            <Search aria-hidden="true" />
            <strong>{t(language, "conv.noResults")}</strong>
            <span>{t(language, "conv.noResultsHint")}</span>
            <button type="button" onClick={() => setQuery("")}>
              {t(language, "feedback.dismiss")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
