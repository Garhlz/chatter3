import { httpBaseURL, wsBaseURL } from "../config";
import { useChatStore } from "../store/chatStore";

export function TelemetryPanel() {
  const token = useChatStore((state) => state.token);
  const status = useChatStore((state) => state.status);
  const reconnect = useChatStore((state) => state.reconnect);
  const refreshOnlineUsers = useChatStore((state) => state.refreshOnlineUsers);

  return (
    <section className="panel telemetry-panel">
      <p className="section-label">Telemetry</p>
      <div className="connection-summary">
        <div>
          <span className={`status-dot status-${status}`} />
          <strong>{status}</strong>
        </div>
        <small>
          HTTP primes history. WebSocket streams presence and realtime message
          flow.
        </small>
      </div>
      <div className="telemetry-actions">
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={!token}
          onClick={reconnect}
        >
          Reconnect
        </button>
        <button
          type="button"
          className="secondary-button compact-button"
          disabled={!token}
          onClick={() => void refreshOnlineUsers()}
        >
          Refresh users
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
          <code>{token ? "present" : "missing"}</code>
        </div>
      </div>
    </section>
  );
}
