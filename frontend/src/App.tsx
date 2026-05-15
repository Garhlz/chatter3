import { useEffect } from "react";
import { ArchiveTools } from "./components/ArchiveTools";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ConversationList } from "./components/ConversationList";
import { IdentityPanel } from "./components/IdentityPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useChatStore } from "./store/chatStore";

export function App() {
  const currentUser = useChatStore((state) => state.currentUser);
  const status = useChatStore((state) => state.status);
  const disconnect = useChatStore((state) => state.disconnect);

  useKeyboardShortcuts();

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  if (!currentUser) {
    return (
      <div className="desktop-shell auth-shell">
        <header className="topbar auth-topbar">
          <div>
            <p className="topbar-eyebrow">Chatter3 // realtime console</p>
            <h1>Signal Desk</h1>
          </div>
        </header>
        <main className="auth-overlay">
          <AuthPanel />
        </main>
      </div>
    );
  }

  return (
    <div className="desktop-shell">
      <header className="topbar">
        <div>
          <p className="topbar-eyebrow">Chatter3 // realtime console</p>
          <h1>Signal Desk</h1>
        </div>
        <div className="topbar-status">
          <span className={`status-dot status-${status}`} />
          <div>
            <strong>{status.toUpperCase()}</strong>
            <small>operator: {currentUser.nickname}</small>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="control-rail">
          <IdentityPanel />
          <TelemetryPanel />
        </aside>

        <aside className="conversation-rail">
          <ConversationList />
          <ArchiveTools />
        </aside>

        <section className="stage">
          <ChatPanel />
        </section>
      </main>
    </div>
  );
}
