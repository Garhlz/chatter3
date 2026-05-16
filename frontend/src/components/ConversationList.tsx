import { useShallow } from "zustand/shallow";
import { t, type Language } from "../i18n";
import {
  selectConversationList,
  useChatStore,
} from "../store/chatStore";
import type { Conversation } from "../store/helpers";

function conversationTitle(language: Language, conversation: Conversation) {
  if (conversation.scope === "public") {
    return t(language, "chat.publicTitle");
  }
  if (conversation.scope === "private") {
    return t(language, "chat.directTitle", { name: conversation.peerUsername });
  }
  return conversation.title;
}

function conversationDescription(language: Language, conversation: Conversation) {
  if (conversation.scope === "public") {
    return language === "zh-CN" ? "公共消息频道" : "Shared broadcast channel";
  }
  if (conversation.scope === "private") {
    return language === "zh-CN"
      ? `与 @${conversation.peerUsername} 的私聊`
      : `Private conversation with @${conversation.peerUsername}`;
  }
  if (conversation.memberCount !== undefined) {
    return language === "zh-CN"
      ? `${conversation.memberCount} 位成员`
      : conversation.description;
  }
  return conversation.description;
}

export function ConversationList() {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore(useShallow(selectConversationList));
  const newGroupName = useChatStore((state) => state.newGroupName);
  const newGroupMembers = useChatStore((state) => state.newGroupMembers);
  const setNewGroupName = useChatStore((state) => state.setNewGroupName);
  const setNewGroupMembers = useChatStore((state) => state.setNewGroupMembers);
  const openConversation = useChatStore((state) => state.openConversation);
  const createGroup = useChatStore((state) => state.createGroup);
  const loadGroups = useChatStore((state) => state.loadGroups);

  return (
    <section className="panel session-panel">
      <header className="panel-header">
        <div>
          <p className="section-label">{t(language, "conversations.label")}</p>
          <h2>{t(language, "conversations.title")}</h2>
        </div>
        <span className="count-badge">{onlineUsers.length}</span>
      </header>

      <div className="channel-list">
        {conversations.map((conversation) => (
          <button
            type="button"
            key={conversation.id}
            className={`channel-card ${
              activeConversationId === conversation.id
                ? "channel-card-active"
                : ""
            }`}
            onClick={() => openConversation(conversation.id)}
          >
            <span
              className={`channel-pulse ${
                conversation.online === false ? "channel-pulse-muted" : ""
              }`}
            />
            <strong>{conversationTitle(language, conversation)}</strong>
            <small>
              {conversation.lastMessage ??
                (token ? conversationDescription(language, conversation) : t(language, "conversations.loginRequired"))}
            </small>
            {conversation.unreadCount > 0 ? (
              <em>{conversation.unreadCount}</em>
            ) : null}
          </button>
        ))}

        <div className="channel-group-label">
          {t(language, "conversations.groups")}
          <button
            type="button"
            className="secondary-button compact-button"
            style={{ float: "right", minHeight: 24, fontSize: "0.68rem" }}
            disabled={!token}
            onClick={() => void loadGroups()}
          >
            {t(language, "conversations.refresh")}
          </button>
        </div>

        <div className="form-block" style={{ gap: 6 }}>
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            disabled={!token}
            placeholder={t(language, "conversations.groupName")}
            data-group-name-input
            style={{ minHeight: 36, fontSize: "0.82rem" }}
          />
          <input
            value={newGroupMembers}
            onChange={(e) => setNewGroupMembers(e.target.value)}
            disabled={!token}
            placeholder={t(language, "conversations.groupMembers")}
            style={{ minHeight: 36, fontSize: "0.82rem" }}
          />
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!token || !newGroupName.trim()}
            onClick={() => void createGroup()}
          >
            {t(language, "conversations.newGroup")}
          </button>
        </div>
      </div>
    </section>
  );
}
