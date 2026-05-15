import { useChatStore } from "../store/chatStore";

export function ArchiveTools() {
  const historyTarget = useChatStore((state) => state.historyTarget);
  const setHistoryTarget = useChatStore((state) => state.setHistoryTarget);
  const loadPublicHistory = useChatStore((state) => state.loadPublicHistory);
  const loadPrivateHistory = useChatStore((state) => state.loadPrivateHistory);

  return (
    <section className="panel tools-panel">
      <header className="panel-header panel-header-tight">
        <div>
          <p className="section-label">Archive</p>
          <h2>Manual lookup</h2>
        </div>
      </header>
      <button
        type="button"
        className="secondary-button"
        onClick={() => void loadPublicHistory()}
      >
        Reload public history
      </button>
      <label>
        Private history username
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
        Load direct messages
      </button>
    </section>
  );
}
