import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function ArchiveTools() {
  const language = useChatStore((state) => state.language);
  const historyTarget = useChatStore((state) => state.historyTarget);
  const setHistoryTarget = useChatStore((state) => state.setHistoryTarget);
  const loadPublicHistory = useChatStore((state) => state.loadPublicHistory);
  const loadPrivateHistory = useChatStore((state) => state.loadPrivateHistory);

  return (
    <section className="panel tools-panel">
      <header className="panel-header panel-header-tight">
        <div>
          <p className="section-label">{t(language, "archive.label")}</p>
          <h2>{t(language, "archive.title")}</h2>
        </div>
      </header>
      <button
        type="button"
        className="secondary-button"
        onClick={() => void loadPublicHistory()}
      >
        {t(language, "archive.reloadPublic")}
      </button>
      <label>
        {t(language, "archive.privateUsername")}
        <input
          data-private-history-input
          value={historyTarget}
          onChange={(event) => setHistoryTarget(event.target.value)}
          placeholder="bob"
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        onClick={() => void loadPrivateHistory()}
      >
        {t(language, "archive.loadDirect")}
      </button>
    </section>
  );
}
