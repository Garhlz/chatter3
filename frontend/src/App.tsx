import { useEffect } from "react";
import { ArchiveTools } from "./components/ArchiveTools";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ConversationList } from "./components/ConversationList";
import { IdentityPanel } from "./components/IdentityPanel";
import { TelemetryPanel } from "./components/TelemetryPanel";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { statusLabel, t } from "./i18n";
import { useChatStore } from "./store/chatStore";
import { resolveThemeMode, watchSystemTheme } from "./theme";

export function App() {
  const currentUser = useChatStore((state) => state.currentUser);
  const language = useChatStore((state) => state.language);
  const themeMode = useChatStore((state) => state.themeMode);
  const setResolvedTheme = useChatStore((state) => state.setResolvedTheme);
  const status = useChatStore((state) => state.status);
  const disconnect = useChatStore((state) => state.disconnect);
  const bootstrapSession = useChatStore((state) => state.bootstrapSession);

  useKeyboardShortcuts();

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    setResolvedTheme(resolveThemeMode(themeMode));
    if (themeMode !== "system") {
      return;
    }
    return watchSystemTheme(setResolvedTheme);
  }, [setResolvedTheme, themeMode]);

  if (!currentUser) {
    return (
      <div className="desktop-shell auth-shell">
        <header className="topbar auth-topbar">
          <div>
            <p className="topbar-eyebrow">{t(language, "app.eyebrow")}</p>
            <h1>{t(language, "app.title")}</h1>
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
          <p className="topbar-eyebrow">{t(language, "app.eyebrow")}</p>
          <h1>{t(language, "app.title")}</h1>
        </div>
        <div className="topbar-status">
          <span className={`status-dot status-${status}`} />
          <div>
            <strong>{statusLabel(language, status)}</strong>
            <small>{t(language, "app.currentUser", { name: currentUser.nickname })}</small>
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
