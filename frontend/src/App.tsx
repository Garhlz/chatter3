import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { ChatPanel } from "./components/ChatPanel";
import { CreateGroupModal } from "./components/CreateGroupModal";
import { DevPanel } from "./components/DevPanel";
import { GlobalFeedback } from "./components/GlobalFeedback";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { UserProfileModal } from "./components/UserProfileModal";
import { IconButton } from "./components/ui/IconButton";
import {
  listenDesktopReconnect,
  listenDesktopWindowState,
} from "./desktop";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWindowSizeClass } from "./hooks/useWindowSizeClass";
import { t } from "./i18n";
import { useChatStore } from "./store/chatStore";
import { resolveThemeMode, watchSystemTheme } from "./theme";

export function App() {
  const currentUser = useChatStore((state) => state.currentUser);
  const language = useChatStore((state) => state.language);
  const themeMode = useChatStore((state) => state.themeMode);
  const setResolvedTheme = useChatStore((state) => state.setResolvedTheme);
  const reconnect = useChatStore((state) => state.reconnect);
  const setDesktopWindowState = useChatStore((state) => state.setDesktopWindowState);
  const hydrateDesktopPreferences = useChatStore((state) => state.hydrateDesktopPreferences);
  const disconnect = useChatStore((state) => state.disconnect);
  const openPrivateConversation = useChatStore((state) => state.openPrivateConversation);
  const bootstrapSession = useChatStore((state) => state.bootstrapSession);

  const [showDev, setShowDev] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const bootstrapStarted = useRef(false);
  const windowSizeClass = useWindowSizeClass();
  const isOverlaySidebar = windowSizeClass === "narrow-desktop";

  useKeyboardShortcuts();

  useEffect(() => {
    void hydrateDesktopPreferences();
  }, [hydrateDesktopPreferences]);

  useEffect(() => {
    // React StrictMode 在开发环境会额外执行一次 effect。恢复流程包含 HTTP 和
    // WebSocket 副作用，所以同一次 App 挂载只允许启动一条恢复链路。
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => () => disconnect(), [disconnect]);

  useEffect(() => {
    setResolvedTheme(resolveThemeMode(themeMode));
    if (themeMode !== "system") return;
    return watchSystemTheme(setResolvedTheme);
  }, [setResolvedTheme, themeMode]);

  useEffect(() => {
    let disposed = false;
    let cleanupReconnect: (() => void) | undefined;
    let cleanupWindowState: (() => void) | undefined;

    void listenDesktopReconnect(() => reconnect()).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupReconnect = cleanup;
    });
    void listenDesktopWindowState(setDesktopWindowState).then((cleanup) => {
      if (disposed) cleanup();
      else cleanupWindowState = cleanup;
    });
    return () => {
      disposed = true;
      cleanupReconnect?.();
      cleanupWindowState?.();
    };
  }, [reconnect, setDesktopWindowState]);

  useEffect(() => {
    if (!isOverlaySidebar) setShowSidebar(false);
  }, [isOverlaySidebar]);

  if (!currentUser) {
    return (
      <main className="auth-overlay">
        <AuthPanel />
      </main>
    );
  }

  return (
    <div className={`app-shell size-${windowSizeClass}`}>
      {isOverlaySidebar ? (
        <IconButton
          icon={Menu}
          label={t(language, showSidebar ? "app.closeSidebar" : "app.openSidebar")}
          className="mobile-sidebar-trigger"
          onClick={() => setShowSidebar((visible) => !visible)}
        />
      ) : null}

      <aside className={`app-sidebar ${isOverlaySidebar ? "is-overlay" : ""} ${showSidebar ? "is-open" : ""}`}>
        <Sidebar
          onCreateGroup={() => setShowCreateGroup(true)}
          onConversationOpen={() => setShowSidebar(false)}
          onProfileOpen={() => setProfileUsername(currentUser.username)}
          onSettingsOpen={() => setShowSettings(true)}
        />
      </aside>

      {isOverlaySidebar && showSidebar ? (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setShowSidebar(false)}
          aria-label={t(language, "app.closeSidebar")}
        />
      ) : null}

      <main className="chat-stage">
        <ChatPanel
          onProfileOpen={(username) => setProfileUsername(username)}
          windowSizeClass={windowSizeClass}
        />
      </main>

      <GlobalFeedback />

      {showSettings ? (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onOpenDev={() => setShowDev(true)}
        />
      ) : null}
      {showDev ? <DevPanel onClose={() => setShowDev(false)} /> : null}
      {showCreateGroup ? (
        <CreateGroupModal onClose={() => setShowCreateGroup(false)} />
      ) : null}
      {profileUsername ? (
        <UserProfileModal
          username={profileUsername}
          onClose={() => setProfileUsername(null)}
          onStartConversation={(username) => {
            setProfileUsername(null);
            void openPrivateConversation(username, { preloadHistory: false });
          }}
        />
      ) : null}
    </div>
  );
}
