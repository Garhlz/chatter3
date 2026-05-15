import { useRef } from "react";
import { useShallow } from "zustand/shallow";
import { Composer } from "./Composer";
import { GroupPanel } from "./GroupPanel";
import { MessageList } from "./MessageList";
import {
  selectActiveConversation,
  selectActiveMessages,
  selectActiveStats,
  useChatStore,
} from "../store/chatStore";

export function ChatPanel() {
  const token = useChatStore((state) => state.token);
  const status = useChatStore((state) => state.status);
  const activeHistoryCursor = useChatStore(
    (state) => state.historyCursors[state.activeConversationId],
  );
  const historyLoading = useChatStore((state) => state.historyLoading);
  const lastSelectedFile = useChatStore((state) => state.lastSelectedFile);
  const uploadingFile = useChatStore((state) => state.uploadingFile);
  const messages = useChatStore(useShallow(selectActiveMessages));
  const activeConversation = useChatStore(useShallow(selectActiveConversation));
  const activeStats = useChatStore(useShallow(selectActiveStats));
  const loadOlderHistory = useChatStore((state) => state.loadOlderHistory);
  const reloadActiveHistory = useChatStore((state) => state.reloadActiveHistory);
  const uploadFile = useChatStore((state) => state.uploadFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleBrowserFilePick() {
    fileInputRef.current?.click();
  }

  function handleBrowserFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const receiver =
      activeConversation.scope === "private"
        ? activeConversation.peerUsername
        : undefined;
    void uploadFile(file, receiver);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handlePickFile() {
    // 真实上传仍然依赖浏览器 File 对象。
    // 之前 Tauri 分支只拿到了本地路径字符串，界面看起来像“已选择”，但实际上无法上传。
    // 在补齐原生文件读取桥接前，统一回到 input[type=file] 是更可靠的行为。
    handleBrowserFilePick();
  }

  const historyScopeLabel =
    activeConversation.scope === "public"
      ? "Lobby"
      : activeConversation.scope === "group"
        ? "Group"
        : "Direct";
  const isConnected = status === "connected";
  const messageCountLabel =
    messages.length === 1 ? "1 message" : `${messages.length} messages`;

  return (
    <section className="panel conversation-panel">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleBrowserFileChange}
      />

      <header className="conversation-header">
        <div>
          <p className="section-label">Conversation // {historyScopeLabel}</p>
          <h2>{activeConversation.title}</h2>
          <small>{activeConversation.description}</small>
        </div>
        <div className="header-actions">
          <span className="scope-badge">{messageCountLabel}</span>
          {activeStats.sendingCount > 0 ? (
            <span className="scope-badge scope-badge-warn">
              {activeStats.sendingCount} sending
            </span>
          ) : null}
          {activeStats.failedCount > 0 ? (
            <span className="scope-badge scope-badge-error">
              {activeStats.failedCount} failed
            </span>
          ) : null}
          {activeConversation.updatedAt ? (
            <span className="scope-badge">
              {new Date(activeConversation.updatedAt).toLocaleTimeString()}
            </span>
          ) : null}
          {activeHistoryCursor ? (
            <button
              type="button"
              className="secondary-button compact-button"
              disabled={historyLoading}
              onClick={() => void loadOlderHistory()}
            >
              {historyLoading ? "Loading" : "Load older"}
            </button>
          ) : null}
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!token || historyLoading}
            onClick={() => void reloadActiveHistory()}
          >
            Reload
          </button>
          <span className={`scope-badge ${isConnected ? "scope-badge-live" : ""}`}>
            {isConnected ? "LIVE" : "OFFLINE"}
          </span>
          <button
            type="button"
            className="secondary-button compact-button"
            disabled={!token || uploadingFile}
            onClick={() => handlePickFile()}
          >
            {uploadingFile ? "Uploading..." : "Attach file"}
          </button>
        </div>
      </header>

      <MessageList />

      <GroupPanel />

      {lastSelectedFile && !uploadingFile ? (
        <div className="callout neutral file-callout">
          Selected: {lastSelectedFile}
        </div>
      ) : null}

      {uploadingFile ? (
        <div className="callout neutral">
          Uploading {lastSelectedFile}…
        </div>
      ) : null}

      <Composer />
    </section>
  );
}
