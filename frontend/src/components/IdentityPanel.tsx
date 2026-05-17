import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function IdentityPanel({
  onProfileClick,
}: {
  onProfileClick: () => void;
}) {
  const language = useChatStore((state) => state.language);
  const currentUser = useChatStore((state) => state.currentUser);

  if (!currentUser) return null;

  return (
    <section className="panel identity-panel">
      <button
        type="button"
        className="identity-card-btn"
        onClick={onProfileClick}
      >
        <div className="identity-card">
          <strong>{currentUser.nickname}</strong>
          <span>@{currentUser.username}</span>
          <small>{t(language, "identity.sessionActive")}</small>
        </div>
      </button>
    </section>
  );
}
