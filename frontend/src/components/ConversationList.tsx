import {
  selectConversationList,
  useChatStore,
} from "../store/chatStore";

export function ConversationList() {
  const token = useChatStore((state) => state.token);
  const onlineUsers = useChatStore((state) => state.onlineUsers);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const conversations = useChatStore(selectConversationList);
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
          <p className="section-label">Channels</p>
          <h2>Conversation stack</h2>
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
            <strong>{conversation.title}</strong>
            <small>
              {conversation.lastMessage ??
                (token ? conversation.description : "login required")}
            </small>
            {conversation.unreadCount > 0 ? (
              <em>{conversation.unreadCount}</em>
            ) : null}
          </button>
        ))}

        <div className="channel-group-label">
          Groups
          <button
            type="button"
            className="secondary-button compact-button"
            style={{ float: "right", minHeight: 24, fontSize: "0.68rem" }}
            disabled={!token}
            onClick={() => void loadGroups()}
          >
            Refresh
          </button>
        </div>

        <div className="form-block" style={{ gap: 6 }}>
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            disabled={!token}
            placeholder="Group name"
            data-group-name-input
            style={{ minHeight: 36, fontSize: "0.82rem" }}
          />
          <input
            value={newGroupMembers}
            onChange={(e) => setNewGroupMembers(e.target.value)}
            disabled={!token}
            placeholder="Members (comma-separated)"
            style={{ minHeight: 36, fontSize: "0.82rem" }}
          />
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!token || !newGroupName.trim()}
            onClick={() => void createGroup()}
          >
            New group
          </button>
        </div>
      </div>
    </section>
  );
}
