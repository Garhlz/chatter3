import { httpBaseURL, wsBaseURL } from "../config";
import { statusLabel, t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function TelemetryPanel() {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const status = useChatStore((state) => state.status);
  const reconnect = useChatStore((state) => state.reconnect);
  const refreshOnlineUsers = useChatStore((state) => state.refreshOnlineUsers);

  return (
    <section className="panel telemetry-panel">
      <p className="section-label">{t(language, "telemetry.title")}</p>
      <div className="connection-summary">
        <div>
          <span className={`status-dot status-${status}`} />
          <strong>{statusLabel(language, status)}</strong>
        </div>
        <small>{t(language, "telemetry.summary")}</small>
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
          onClick={() => void refreshOnlineUsers()}
        >
          {t(language, "telemetry.refreshUsers")}
        </button>
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
          <code>{token ? t(language, "telemetry.tokenPresent") : t(language, "telemetry.tokenMissing")}</code>
        </div>
      </div>
    </section>
  );
}
