import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { useState } from "react";

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const language = useChatStore((state) => state.language);
  const newGroupName = useChatStore((state) => state.newGroupName);
  const newGroupMembers = useChatStore((state) => state.newGroupMembers);
  const setNewGroupName = useChatStore((state) => state.setNewGroupName);
  const setNewGroupMembers = useChatStore((state) => state.setNewGroupMembers);
  const createGroup = useChatStore((state) => state.createGroup);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  async function handleCreateGroup() {
    setSubmitting(true);
    setSubmitError("");
    await createGroup();
    const nextError = useChatStore.getState().error;
    setSubmitting(false);
    if (nextError) {
      setSubmitError(nextError);
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="panel-header">
          <div>
            <p className="section-label">{t(language, "modal.groupTitle")}</p>
            <h2>{t(language, "modal.createGroup")}</h2>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <div className="form-block modal-form">
            <label>
              {t(language, "modal.groupName")}
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={t(language, "modal.groupNameHint")}
                disabled={submitting}
                data-group-name-input
              />
            </label>
            <label>
              {t(language, "modal.groupMembers")}
              <input
                value={newGroupMembers}
                onChange={(e) => setNewGroupMembers(e.target.value)}
                placeholder={t(language, "modal.groupMembersHint")}
                disabled={submitting}
              />
            </label>
            {submitError ? (
              <div className="callout error" role="alert">
                <span>{submitError}</span>
              </div>
            ) : null}
            <button
              type="button"
              className="primary-button"
              disabled={!newGroupName.trim() || submitting}
              onClick={() => handleCreateGroup().catch(() => {})}
            >
              {submitting
                ? t(language, "modal.creatingGroup")
                : t(language, "modal.createGroup")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
