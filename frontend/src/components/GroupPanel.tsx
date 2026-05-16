import { useState } from "react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function GroupPanel() {
  const language = useChatStore((state) => state.language);
  const activeConversation = useChatStore((state) =>
    state.conversations[state.activeConversationId],
  );
  const currentUser = useChatStore((state) => state.currentUser);
  const token = useChatStore((state) => state.token);
  const addGroupMembers = useChatStore((state) => state.addGroupMembers);
  const removeGroupMember = useChatStore((state) => state.removeGroupMember);
  const [addInput, setAddInput] = useState("");

  if (!activeConversation || activeConversation.scope !== "group") {
    return null;
  }

  const groupID = activeConversation.groupID;
  const members = activeConversation.members ?? [];
  const isCurrentUserAdmin =
    currentUser &&
    members.some(
      (m) =>
        m.user.username === currentUser.username &&
        (m.role === 1 || m.role === 2),
    );

  function handleAddMembers() {
    const usernames = addInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (usernames.length === 0 || !groupID) return;
    void addGroupMembers(groupID, usernames);
    setAddInput("");
  }

  function handleRemoveMember(username: string) {
    if (!groupID) return;
    void removeGroupMember(groupID, username);
  }

  return (
    <section className="panel group-panel">
      <header className="panel-header panel-header-tight">
        <div>
          <p className="section-label">{t(language, "group.label")}</p>
          <h2>{activeConversation.title}</h2>
          <small>{activeConversation.description}</small>
        </div>
      </header>

      <div className="group-members">
        <p className="section-label">{t(language, "group.members", { count: members.length })}</p>
        {members.map((member) => (
          <div key={member.user.username} className="member-row">
            <span
              className={`channel-pulse ${
                !member.user.online ? "channel-pulse-muted" : ""
              }`}
            />
            <div className="member-info">
              <strong>
                {member.user.nickname}
                {member.role === 2
                  ? ` (${t(language, "group.owner")})`
                  : member.role === 1
                    ? ` (${t(language, "group.admin")})`
                    : ""}
              </strong>
              <small>@{member.user.username}</small>
            </div>
            {isCurrentUserAdmin && member.role !== 2 && (
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => handleRemoveMember(member.user.username)}
                style={{ minHeight: 28, fontSize: "0.7rem" }}
              >
                {t(language, "group.remove")}
              </button>
            )}
          </div>
        ))}

        {members.length === 0 && (
          <div className="placeholder-card">
            <strong>{t(language, "group.noMembers")}</strong>
            <span>{t(language, "group.noMembersHint")}</span>
          </div>
        )}
      </div>

      {isCurrentUserAdmin && (
        <div className="form-block" style={{ gap: 6 }}>
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            disabled={!token}
            placeholder={t(language, "group.addPlaceholder")}
            style={{ minHeight: 36, fontSize: "0.82rem" }}
          />
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!addInput.trim() || !token}
            onClick={handleAddMembers}
          >
            {t(language, "group.addMembers")}
          </button>
        </div>
      )}
    </section>
  );
}
