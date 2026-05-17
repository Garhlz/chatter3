import { useState } from "react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function GroupPanel({
  onProfileOpen,
}: {
  onProfileOpen: (username: string) => void;
}) {
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
  const [memberActionError, setMemberActionError] = useState("");

  if (!activeConversation || activeConversation.scope !== "group") {
    return null;
  }

  const groupID = activeConversation.groupID;
  const members = activeConversation.members ?? [];
  const currentUserRole =
    currentUser &&
    members.find((m) => m.user.username === currentUser.username)?.role;
  const isCurrentUserAdmin =
    currentUserRole === 1 || currentUserRole === 2;

  const roleLabel = (role: number) =>
    role === 2
      ? t(language, "group.roleOwner")
      : role === 1
        ? t(language, "group.roleAdmin")
        : t(language, "group.roleMember");

  const roleHint =
    currentUserRole === 2
      ? t(language, "group.roleOwnerHint")
      : currentUserRole === 1
        ? t(language, "group.roleAdminHint")
        : t(language, "group.roleMemberHint");

  async function handleAddMembers() {
    const usernames = addInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((username, index, all) => all.indexOf(username) === index);
    if (usernames.length === 0 || !groupID) return;
    setMemberLoading(true);
    setMemberActionError("");
    await addGroupMembers(groupID, usernames);
    const nextError = useChatStore.getState().error;
    if (nextError) {
      setMemberActionError(nextError);
    } else {
      setAddInput("");
    }
    setMemberLoading(false);
  }

  async function handleRemoveMember(username: string) {
    if (!groupID) return;
    setMemberLoading(true);
    setMemberActionError("");
    await removeGroupMember(groupID, username);
    const nextError = useChatStore.getState().error;
    if (nextError) {
      setMemberActionError(nextError);
    }
    setMemberLoading(false);
    setPendingRemoval(null);
  }

  return (
    <section className="panel group-panel">
      <header className="panel-header panel-header-tight group-panel-header">
        <div>
          <p className="section-label">{t(language, "group.label")}</p>
          <h2>{activeConversation.title}</h2>
          <small>
            {activeConversation.memberCount != null
              ? t(language, "group.members", { count: activeConversation.memberCount })
              : activeConversation.description}
          </small>
          {activeConversation.creatorUsername && (
            <small className="text-muted">
              {t(language, "group.createdBy", {
                name: activeConversation.creatorUsername,
              })}
            </small>
          )}
        </div>
      </header>

      <div className="group-summary-grid">
        <div className="group-summary-item">
          <span className="section-label">{t(language, "group.summaryMembers")}</span>
          <strong>{activeConversation.memberCount ?? members.length}</strong>
        </div>
        <div className="group-summary-item">
          <span className="section-label">{t(language, "group.summaryCreator")}</span>
          {activeConversation.creatorUsername ? (
            <button
              type="button"
              className="member-profile-trigger creator-profile-trigger"
              onClick={() => onProfileOpen(activeConversation.creatorUsername!)}
            >
              {activeConversation.creatorNickname || `@${activeConversation.creatorUsername}`}
            </button>
          ) : (
            <strong>--</strong>
          )}
        </div>
        <div className="group-summary-item">
          <span className="section-label">{t(language, "group.summaryRole")}</span>
          <strong>
            {currentUserRole != null ? roleLabel(currentUserRole) : t(language, "group.roleMember")}
          </strong>
        </div>
      </div>

      {currentUserRole != null && (
        <div className="group-role-badge">
          <span className="scope-badge">
            {roleLabel(currentUserRole)}
          </span>
          <small>{roleHint}</small>
        </div>
      )}

      <div className="group-members">
        <p className="section-label">{t(language, "group.members", { count: members.length })}</p>
        {members.map((member) => (
          <div key={member.user.username} className="member-row">
            <div className="member-info">
              <button
                type="button"
                className="member-profile-trigger"
                onClick={() => onProfileOpen(member.user.username)}
              >
                <span
                  className={`channel-pulse ${
                    member.user.online === false ? "channel-pulse-muted" : ""
                  }`}
                />
                <strong>{member.user.nickname}</strong>
              </button>
              <small>@{member.user.username}</small>
            </div>
            <span className="member-role-badge">{roleLabel(member.role)}</span>
            {isCurrentUserAdmin && member.role !== 2 && (
              <button
                type="button"
                className="secondary-button compact-button"
                disabled={memberLoading}
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
          {memberActionError && (
            <div className="callout error" role="alert">
              <span>{memberActionError}</span>
              <button
                type="button"
                className="compact-button"
                onClick={() => setMemberActionError("")}
              >
                ×
              </button>
            </div>
          )}
          <input
            value={addInput}
            onChange={(e) => setAddInput(e.target.value)}
            disabled={!token || memberLoading}
            placeholder={t(language, "group.addPlaceholder")}
            className="group-member-input"
          />
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!addInput.trim() || !token || memberLoading}
            onClick={() => handleAddMembers().catch(() => {})}
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
          <small>{t(language, "group.confirmRemoveContext")}</small>
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
              onClick={() => handleRemoveMember(pendingRemoval).catch(() => {})}
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
