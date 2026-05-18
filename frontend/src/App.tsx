import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { ConversationList } from "./components/ConversationList";
import { CreateGroupModal } from "./components/CreateGroupModal";
import { DevPanel } from "./components/DevPanel";
import { GlobalFeedback } from "./components/GlobalFeedback";
import { IdentityPanel } from "./components/IdentityPanel";
import { UserProfileModal } from "./components/UserProfileModal";
import {
  listenDesktopReconnect,
  listenDesktopWindowState,
} from "./desktop";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowSizeClass } from "./hooks/useWindowSizeClass";
import { statusLabel, t } from "./i18n";
import { useChatStore } from "./store/chatStore";
import { resolveThemeMode, watchSystemTheme } from "./theme";

export function App() {
  const currentUser = useChatStore((state) => state.currentUser);
  const language = useChatStore((state) => state.language);
  const themeMode = useChatStore((state) => state.themeMode);
  const setResolvedTheme = useChatStore((state) => state.setResolvedTheme);
  const status = useChatStore((state) => state.status);
  const reconnect = useChatStore((state) => state.reconnect);
  const setDesktopWindowState = useChatStore(
    (state) => state.setDesktopWindowState,
  );
  const hydrateDesktopPreferences = useChatStore(
    (state) => state.hydrateDesktopPreferences,
  );
  const disconnect = useChatStore((state) => state.disconnect);
  const openPrivateConversation = useChatStore((state) => state.openPrivateConversation);
  const bootstrapSession = useChatStore((state) => state.bootstrapSession);

  const [showDev, setShowDev] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const windowSizeClass = useWindowSizeClass();
  const isNarrowDesktop = windowSizeClass === "narrow-desktop";

  useKeyboardShortcuts();

  useEffect(() => {
    void hydrateDesktopPreferences();
  }, [hydrateDesktopPreferences]);

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

  useEffect(() => {
    let disposed = false;
    let cleanupReconnect: (() => void) | undefined;
    let cleanupWindowState: (() => void) | undefined;

    void listenDesktopReconnect(() => reconnect()).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupReconnect = cleanup;
    }).catch(() => {});
    void listenDesktopWindowState(setDesktopWindowState).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupWindowState = cleanup;
    }).catch(() => {});

    return () => {
      disposed = true;
      cleanupReconnect?.();
      cleanupWindowState?.();
    };
  }, [reconnect, setDesktopWindowState]);

  useEffect(() => {
    if (!isNarrowDesktop) {
      setShowSidebar(false);
    }
  }, [isNarrowDesktop]);

  if (!currentUser) {
    return (
      <div className={`desktop-shell auth-shell size-${windowSizeClass}`}>
        <main className="auth-overlay">
          <AuthPanel />
        </main>
      </div>
    );
  }

  return (
    <div className={`desktop-shell size-${windowSizeClass}`}>
      <header className="topbar">
        <div className="topbar-brand">
          <p className="topbar-eyebrow">{t(language, "app.eyebrow")}</p>
          <strong>{t(language, "app.title")}</strong>
        </div>
        <div className="topbar-status">
          <button
            type="button"
            className="secondary-button compact-button mobile-sidebar-toggle"
            onClick={() => setShowSidebar((value) => !value)}
            aria-label={
              showSidebar
                ? t(language, "app.closeSidebar")
                : t(language, "app.openSidebar")
            }
            title={
              showSidebar
                ? t(language, "app.closeSidebar")
                : t(language, "app.openSidebar")
            }
          >
            {showSidebar ? "×" : "☰"}
          </button>
          <span className={`status-dot status-${status}`} />
          <div>
            <strong>{statusLabel(language, status)}</strong>
            <small>{t(language, "app.currentUser", { name: currentUser.nickname })}</small>
          </div>
          <button
            type="button"
            className="secondary-button compact-button topbar-dev-toggle"
            onClick={() => setShowDev(!showDev)}
            aria-label={t(language, "app.toggleDev")}
            title={t(language, "app.toggleDev")}
          >
            {showDev ? "×" : "Dev"}
          </button>
        </div>
      </header>

      <GlobalFeedback />

      <main className={`workspace workspace-two-col workspace-${windowSizeClass}`}>
        <aside
          className={`sidebar ${
            isNarrowDesktop ? "sidebar-overlay" : "sidebar-docked"
          } ${showSidebar ? "show" : ""}`}
        >
          <IdentityPanel onProfileClick={() => setProfileUsername(currentUser.username)} />
          <ConversationList
            onProfileOpen={(username) => setProfileUsername(username)}
            onCreateGroup={() => setShowCreateGroup(true)}
            onConversationOpen={() => setShowSidebar(false)}
          />
        </aside>

        {isNarrowDesktop && showSidebar ? (
          <button
            type="button"
            className="sidebar-backdrop"
            onClick={() => setShowSidebar(false)}
            aria-label={t(language, "app.closeSidebar")}
          />
        ) : null}

        <section className="stage">
          <ChatPanel
            windowSizeClass={windowSizeClass}
            onProfileOpen={(username) => setProfileUsername(username)}
          />
        </section>
      </main>

      {showDev && <DevPanel onClose={() => setShowDev(false)} />}
      {showCreateGroup && (
        <CreateGroupModal onClose={() => setShowCreateGroup(false)} />
      )}
      {profileUsername && (
        <UserProfileModal
          username={profileUsername}
          onClose={() => setProfileUsername(null)}
          onStartConversation={(username) => {
            setProfileUsername(null);
            void openPrivateConversation(username, { preloadHistory: false });
          }}
        />
      )}
    </div>
  );
}
