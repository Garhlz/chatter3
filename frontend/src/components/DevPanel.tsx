import { X } from "lucide-react";
import { httpBaseURL, wsBaseURL } from "../config";
import { statusLabel, t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { cli } from "./utils";
import { IconButton } from "./ui/IconButton";

export function DevPanel({ onClose }: { onClose: () => void }) {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const status = useChatStore((state) => state.status);
  const reconnect = useChatStore((state) => state.reconnect);
  const refreshOnlineUsers = useChatStore((state) => state.refreshOnlineUsers);
  const loadPublicHistory = useChatStore((state) => state.loadPublicHistory);
  const historyTarget = useChatStore((state) => state.historyTarget);
  const setHistoryTarget = useChatStore((state) => state.setHistoryTarget);
  const loadPrivateHistory = useChatStore((state) => state.loadPrivateHistory);

  return (
    <div className="dev-panel panel">
      <header className="panel-header panel-header-tight">
        <div>
          <p className="section-label">{t(language, "dev.label")}</p>
          <h2>{t(language, "telemetry.title")}</h2>
        </div>
        <IconButton icon={X} label={t(language, "feedback.dismiss")} onClick={onClose} />
      </header>

      <div className="dev-section">
        <div className="connection-summary">
          <div>
            <span className={`status-dot status-${status}`} />
            <strong>{statusLabel(language, status)}</strong>
          </div>
        </div>

        <div className="detail-grid">
          <div>
            <span>HTTP</span>
            <code>{httpBaseURL || "/api via Vite proxy"}</code>
          </div>
          <div>
            <span>WS</span>
            <code>{wsBaseURL}</code>
          </div>
          <div>
            <span>TOKEN</span>
            <code>
              {token
                ? t(language, "telemetry.tokenPresent")
                : t(language, "telemetry.tokenMissing")}
            </code>
          </div>
        </div>

        <div className="telemetry-actions">
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!token}
            onClick={reconnect}
          >
            {t(language, "telemetry.reconnect")}
          </button>
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!token}
            onClick={cli(() => refreshOnlineUsers())}
          >
            {t(language, "telemetry.refreshUsers")}
          </button>
        </div>
      </div>

      <div className="dev-section">
        <p className="section-label">{t(language, "dev.lookup")}</p>
        <button
          type="button"
          className="secondary-button compact-button"
          onClick={cli(() => loadPublicHistory())}
        >
          {t(language, "archive.reloadPublic")}
        </button>
        <input
          data-private-history-input
          value={historyTarget}
          onChange={(e) => setHistoryTarget(e.target.value)}
          placeholder={t(language, "archive.privateUsername")}
          className="dev-input"
        />
        <button
          type="button"
          onClick={cli(() => loadPrivateHistory())}
          className="secondary-button compact-button dev-action"
        >
          {t(language, "archive.loadDirect")}
        </button>
      </div>
    </div>
  );
}
