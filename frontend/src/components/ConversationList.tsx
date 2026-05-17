import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { t } from "../i18n";
import {
  conversationDisplayTitle,
  conversationIsEmptyShell,
  conversationListSecondaryText,
  conversationScopeLabel,
} from "./conversationPresentation";
import {
  selectConversationList,
  useChatStore,
} from "../store/chatStore";
import { cli } from "./utils";

export function ConversationList({
  onProfileOpen,
  onCreateGroup,
  onConversationOpen,
}: {
  onProfileOpen: (username: string) => void;
  onCreateGroup: () => void;
  onConversationOpen?: () => void;
}) {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore(useShallow(selectConversationList));
  const openConversation = useChatStore((state) => state.openConversation);
  const loadGroups = useChatStore((state) => state.loadGroups);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? conversations.filter(
        (c) =>
          c.title.toLowerCase().includes(query.toLowerCase()) ||
          c.peerNickname?.toLowerCase().includes(query.toLowerCase()) ||
          c.peerUsername.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase()) ||
          c.creatorUsername?.toLowerCase().includes(query.toLowerCase()),
      )
    : conversations;

  return (
    <section className="panel session-panel">
      <div className="conv-search-bar">
        <input
          className="conv-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!token}
          placeholder={t(language, "conv.search")}
        />
        <button
          type="button"
          className="secondary-button compact-button conv-add-btn"
          disabled={!token}
          onClick={onCreateGroup}
          title={t(language, "conv.createGroup")}
        >
          +
        </button>
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={!token}
          onClick={cli(() => loadGroups())}
          title={t(language, "conv.refresh")}
        >
          ↻
        </button>
      </div>

      <div className="channel-list">
        {filtered.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={`channel-card ${
              `channel-card-${conversation.kindLabel ?? conversation.scope}`
            } ${
              activeConversationId === conversation.id
                ? "channel-card-active"
                : ""
            }`}
            onClick={() => openConversation(conversation.id)}
            onClickCapture={() => onConversationOpen?.()}
          >
            {conversation.scope === "private" ? (
              <span
                className={`channel-pulse ${
                  conversation.online === false ? "channel-pulse-muted" : ""
                }`}
              />
            ) : null}
            <div className="channel-card-main">
              <div className="channel-card-title-row">
                <strong>{conversationDisplayTitle(conversation)}</strong>
                <span className="channel-kind-tag">
                  {conversationScopeLabel(language, conversation)}
                </span>
              </div>
              <small>
                {token
                  ? conversationListSecondaryText(language, conversation)
                  : t(language, "conversations.loginRequired")}
              </small>
              {token && conversationIsEmptyShell(conversation) ? (
                <span className="channel-empty-hint">
                  {t(language, "conv.emptyState")}
                </span>
              ) : null}
            </div>
            <div className="channel-card-side">
              {conversation.scope === "private" && conversation.peerUsername ? (
                <button
                  type="button"
                  className="conv-profile-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onProfileOpen(conversation.peerUsername);
                  }}
                  aria-label={t(language, "conv.viewProfile")}
                  title={t(language, "conv.viewProfile")}
                >
                  &#9432;
                </button>
              ) : null}
              {conversation.unreadCount > 0 ? (
                <em>{conversation.unreadCount}</em>
              ) : null}
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <div className="placeholder-card">
            <strong>{t(language, "conv.noResults")}</strong>
            <span>{t(language, "conv.noResultsHint")}</span>
          </div>
        )}
      </div>
    </section>
  );
}
