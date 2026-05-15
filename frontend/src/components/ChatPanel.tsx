import { useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
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
  const messages = useChatStore(selectActiveMessages);
  const activeConversation = useChatStore(selectActiveConversation);
  const activeStats = useChatStore(selectActiveStats);
  const setLastSelectedFile = useChatStore((state) => state.setLastSelectedFile);
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

  // Tauri desktop 文件选择与上传
  async function handleTauriFilePick() {
    const selected = await open({ multiple: false });
    if (typeof selected === "string") {
      setLastSelectedFile(selected);
    }
  }

  async function handlePickFile() {
    try {
      await handleTauriFilePick();
    } catch {
      handleBrowserFilePick();
    }
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
            onClick={handlePickFile}
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
