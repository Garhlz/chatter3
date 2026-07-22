import { Hash, Info, MoreHorizontal, RefreshCw, RotateCcw, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import type { WindowSizeClass } from "../hooks/useWindowSizeClass";
import { t } from "../i18n";
import {
  selectActiveConversation,
  selectActiveStats,
  useChatStore,
} from "../store/chatStore";
import { Composer } from "./Composer";
import { conversationDisplayTitle } from "./conversationPresentation";
import { GroupPanel } from "./GroupPanel";
import { MessageList } from "./MessageList";
import { Avatar } from "./ui/Avatar";
import { ConnectionIndicator } from "./ui/ConnectionIndicator";
import { IconButton } from "./ui/IconButton";

export function ChatPanel({
  onProfileOpen,
  windowSizeClass,
}: {
  onProfileOpen: (username: string) => void;
  windowSizeClass: WindowSizeClass;
}) {
  const language = useChatStore((state) => state.language);
  const status = useChatStore((state) => state.status);
  const historyLoading = useChatStore((state) => state.historyLoading);
  const activeConversation = useChatStore(useShallow(selectActiveConversation));
  const activeStats = useChatStore(useShallow(selectActiveStats));
  const reloadActiveHistory = useChatStore((state) => state.reloadActiveHistory);
  const reconnect = useChatStore((state) => state.reconnect);
  const [showDetails, setShowDetails] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    setShowDetails(false);
    setShowMenu(false);
  }, [activeConversation.id]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (showMenu) setShowMenu(false);
      else if (showDetails) setShowDetails(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showDetails, showMenu]);

  const title = conversationDisplayTitle(activeConversation);
  const subtitle =
    activeConversation.scope === "private"
      ? activeConversation.online
        ? t(language, "chat.live")
        : t(language, "chat.offline")
      : activeConversation.scope === "group"
        ? t(language, "group.members", { count: activeConversation.memberCount ?? 0 })
        : t(language, "conv.publicSummary");

  return (
    <section className={`chat-panel chat-panel-${windowSizeClass}`}>
      <header className="chat-header">
        <div className="chat-identity">
          {activeConversation.scope === "private" ? (
            <Avatar
              user={{
                username: activeConversation.peerUsername,
                nickname: title,
              }}
              online={activeConversation.online}
            />
          ) : (
            <span className="conversation-symbol is-header">
              {activeConversation.scope === "group" ? <Users /> : <Hash />}
            </span>
          )}
          <div>
            <strong>{title}</strong>
            <span>{subtitle}</span>
          </div>
        </div>

        <div className="chat-header-actions">
          {status !== "connected" ? (
            <ConnectionIndicator language={language} status={status} />
          ) : null}
          {activeStats.failedCount > 0 ? (
            <span className="failed-message-count">
              {t(language, "chat.failed", { count: activeStats.failedCount })}
            </span>
          ) : null}
          {activeConversation.scope === "private" ? (
            <IconButton
              icon={Info}
              label={t(language, "conv.viewProfile")}
              onClick={() => onProfileOpen(activeConversation.peerUsername)}
            />
          ) : activeConversation.scope === "group" ? (
            <IconButton
              icon={Info}
              label={t(language, "chat.openDetails")}
              onClick={() => setShowDetails(true)}
            />
          ) : null}
          <div className="menu-anchor">
            <IconButton
              icon={MoreHorizontal}
              label={t(language, "chat.moreActions")}
              onClick={() => setShowMenu((visible) => !visible)}
            />
            {showMenu ? (
              <div className="action-menu" role="menu">
                <button
                  type="button"
                  disabled={historyLoading}
                  onClick={() => {
                    setShowMenu(false);
                    void reloadActiveHistory();
                  }}
                >
                  <RefreshCw aria-hidden="true" />
                  {t(language, "chat.reload")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    reconnect();
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                  {t(language, "telemetry.reconnect")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="chat-content">
        <MessageList onProfileOpen={onProfileOpen} />
        <Composer />
      </div>

      {showDetails && activeConversation.scope === "group" ? (
        <div className="details-layer">
          <button
            type="button"
            className="details-backdrop"
            onClick={() => setShowDetails(false)}
            aria-label={t(language, "chat.closeDetails")}
          />
          <aside className="details-drawer">
            <IconButton
              icon={X}
              label={t(language, "chat.closeDetails")}
              className="details-close"
              onClick={() => setShowDetails(false)}
            />
            <GroupPanel mode="drawer" onProfileOpen={onProfileOpen} />
          </aside>
        </div>
      ) : null}
    </section>
  );
}
