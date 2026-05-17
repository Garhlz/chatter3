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
  const [memberLoading, setMemberLoading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);

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
    setMemberLoading(true);
    addGroupMembers(groupID!, usernames).finally(() => setMemberLoading(false));
    setAddInput("");
  }

  function handleRemoveMember(username: string) {
    if (!groupID) return;
    setMemberLoading(true);
    removeGroupMember(groupID, username)
      .finally(() => {
        setMemberLoading(false);
        setPendingRemoval(null);
      })
      .catch(() => {});
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
                onClick={() => setPendingRemoval(member.user.username)}
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
        <div className="form-block group-member-form">
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            disabled={!token}
            placeholder={t(language, "group.addPlaceholder")}
            className="group-member-input"
          />
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!addInput.trim() || !token || memberLoading}
            onClick={() => handleAddMembers()}
          >
            {t(language, "group.addMembers")}
          </button>
        </div>
      )}

      {pendingRemoval ? (
        <div className="callout error group-confirm" role="alertdialog">
          <strong>{t(language, "group.confirmRemove")}</strong>
          <span>
            {t(language, "group.confirmRemoveHint", { name: pendingRemoval })}
          </span>
          <div className="inline-actions">
            <button
              type="button"
              className="secondary-button compact-button"
              onClick={() => setPendingRemoval(null)}
              disabled={memberLoading}
            >
              {t(language, "group.cancelRemove")}
            </button>
            <button
              type="button"
              className="primary-button compact-button danger-button"
              onClick={() => handleRemoveMember(pendingRemoval)}
              disabled={memberLoading}
            >
              {t(language, "group.remove")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
