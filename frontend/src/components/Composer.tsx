import { LoaderCircle, Paperclip, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { runningInTauri, selectDesktopFilePath } from "../desktop";
import { useChatStore } from "../store/chatStore";
import { IconButton } from "./ui/IconButton";
import type { UploadTarget } from "../protocol";

export function Composer() {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const status = useChatStore((state) => state.status);
  const reconnectAttempt = useChatStore((state) => state.reconnectAttempt);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeConversation = useChatStore(
    (state) => state.conversations[state.activeConversationId],
  );
  const draft = useChatStore(
    (state) => state.draftsByConversation[state.activeConversationId] ?? "",
  );
  const uploadingCount = useChatStore((state) => state.uploadingCount);
  const lastSelectedFile = useChatStore((state) => state.lastSelectedFile);
  const setDraft = useChatStore((state) => state.setDraft);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const uploadFile = useChatStore((state) => state.uploadFile);
  const uploadFileFromPath = useChatStore((state) => state.uploadFileFromPath);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composingRef = useRef(false);
  const [localFileError, setLocalFileError] = useState("");

  const isConnected = status === "connected";
  const isGroup = activeConversation?.scope === "group";
  const uploading = uploadingCount > 0;
  const composerPlaceholder =
    activeConversation?.scope === "private"
      ? t(language, "composer.privatePlaceholder", {
          name: activeConversation.peerNickname || activeConversation.peerUsername,
        })
      : isGroup
        ? t(language, "composer.groupPlaceholder", { name: activeConversation.title })
        : t(language, "composer.publicPlaceholder");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [draft, activeConversationId]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !activeConversation) return;
    setLocalFileError("");
    const target = uploadTarget();
    if (!target) return;
    try {
      await uploadFile(file, target);
    } catch (error) {
      setLocalFileError(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleAttach() {
    if (!activeConversation) return;
    if (!runningInTauri()) {
      fileInputRef.current?.click();
      return;
    }

    setLocalFileError("");
    try {
      const filePath = await selectDesktopFilePath();
      if (!filePath) return;
      const target = uploadTarget();
      if (!target) return;
      await uploadFileFromPath(filePath, target);
    } catch (error) {
      setLocalFileError(error instanceof Error ? error.message : String(error));
    }
  }

  function uploadTarget(): UploadTarget | null {
    if (!activeConversation) return null;
    if (activeConversation.scope === "private") {
      return { scope: "private", receiverUsername: activeConversation.peerUsername };
    }
    if (activeConversation.scope === "group" && activeConversation.groupID) {
      return { scope: "group", groupID: activeConversation.groupID };
    }
    return { scope: "public" };
  }

  function submitMessage() {
    if (!draft.trim() || !isConnected) return;
    void sendMessage();
  }

  const connectionHint =
    status === "connecting" || reconnectAttempt > 0
      ? t(language, "composer.reconnecting", { attempt: Math.max(reconnectAttempt, 1) })
      : !isConnected
        ? t(language, "composer.offline")
        : "";

  return (
    <footer className="composer-shell">
      {uploading || lastSelectedFile ? (
        <div className="upload-chip">
          {uploading ? <LoaderCircle className="spin" aria-hidden="true" /> : <Paperclip aria-hidden="true" />}
          <span>{uploading ? t(language, "chat.uploading") : lastSelectedFile}</span>
        </div>
      ) : null}
      {connectionHint || localFileError ? (
        <div className={`composer-feedback ${localFileError ? "is-error" : ""}`}>
          {localFileError || connectionHint}
        </div>
      ) : null}
      <div className="composer-row">
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          onChange={(event) => void handleFile(event)}
          tabIndex={-1}
        />
        <IconButton
          icon={Paperclip}
          label={t(language, "chat.attachFile")}
          disabled={!token || uploading}
          onClick={() => void handleAttach()}
        />
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !composingRef.current) {
              event.preventDefault();
              submitMessage();
            }
          }}
          disabled={!token}
          placeholder={composerPlaceholder}
          rows={1}
        />
        <button
          type="button"
          className="send-button"
          disabled={!draft.trim() || !token || !isConnected}
          onClick={submitMessage}
        >
          <Send aria-hidden="true" />
          <span>{t(language, "composer.send")}</span>
        </button>
      </div>
    </footer>
  );
}
