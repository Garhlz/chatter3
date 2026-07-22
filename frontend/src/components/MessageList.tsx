import {
  AlertCircle,
  Download,
  File,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { httpBaseURL } from "../config";
import {
  loadDesktopFileBytes,
  runningInTauri,
  saveDesktopFile,
} from "../desktop";
import { t } from "../i18n";
import type { FileAttachment } from "../protocol";
import { selectActiveMessages, useChatStore } from "../store/chatStore";
import type { ChatMessageView } from "../store/helpers";
import { formatMessageTime } from "./format";
import { buildMessageTimeline } from "./messageTimeline";
import { Avatar } from "./ui/Avatar";
import { IconButton } from "./ui/IconButton";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchAuthenticatedFile(file: FileAttachment, token: string) {
  if (runningInTauri()) {
    const bytes = await loadDesktopFileBytes(token, file.fileId);
    return new Blob([new Uint8Array(bytes)], { type: file.mimeType });
  }
  const response = await fetch(httpBaseURL + file.downloadURL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.blob();
}

function FileBubble({
  file,
  token,
  caption,
  onPreview,
}: {
  file: FileAttachment;
  token: string;
  caption: string;
  onPreview: (url: string, name: string) => void;
}) {
  const language = useChatStore((state) => state.language);
  const [previewURL, setPreviewURL] = useState("");
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const isImage = file.mimeType?.startsWith("image/");

  useEffect(() => {
    if (!token || !isImage) return;
    let disposed = false;
    let objectURL = "";
    void fetchAuthenticatedFile(file, token)
      .then((blob) => {
        if (disposed) return;
        objectURL = URL.createObjectURL(blob);
        setPreviewURL(objectURL);
      })
      .catch((error) => {
        if (!disposed) setFileError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      disposed = true;
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [file.downloadURL, file.fileId, isImage, token]);

  async function downloadFile() {
    if (!token || saving) return;
    try {
      setSaving(true);
      setFileError("");
      if (runningInTauri()) {
        await saveDesktopFile(token, file.fileId, file.fileName);
      } else {
        const blob = await fetchAuthenticatedFile(file, token);
        const objectURL = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectURL;
        link.download = file.fileName;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(objectURL), 0);
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="file-bubble">
      {isImage ? (
        <button
          type="button"
          className="image-preview-button"
          disabled={!previewURL}
          onClick={() => previewURL && onPreview(previewURL, file.fileName)}
        >
          {previewURL ? (
            <img src={previewURL} alt={file.fileName} />
          ) : (
            <span className="image-skeleton"><ImageIcon aria-hidden="true" /></span>
          )}
        </button>
      ) : null}
      <div className="file-bubble-row">
        <span className="file-kind-icon"><File aria-hidden="true" /></span>
        <span className="file-copy">
          <strong>{file.fileName}</strong>
          <small>{formatFileSize(file.size)} · {file.mimeType || "file"}</small>
        </span>
        <IconButton
          icon={saving ? LoaderCircle : Download}
          label={t(language, "message.download")}
          className={saving ? "spin-icon" : ""}
          disabled={saving}
          onClick={() => void downloadFile()}
        />
      </div>
      {caption ? <p>{caption}</p> : null}
      {fileError ? <small className="inline-error">{fileError}</small> : null}
    </div>
  );
}

function DeliveryState({
  message,
  onRetry,
}: {
  message: ChatMessageView;
  onRetry: () => void;
}) {
  const language = useChatStore((state) => state.language);
  if (message.deliveryStatus === "sent") {
    // 已发送是聊天的正常状态，不额外显示图标，以免每条消息都产生视觉噪音。
    return null;
  }
  if (message.deliveryStatus === "sending") {
    return <LoaderCircle className="delivery-sending spin" aria-label={t(language, "message.status.sending")} />;
  }
  return (
    <button type="button" className="delivery-failed" onClick={onRetry}>
      <AlertCircle aria-hidden="true" />
      <span>{t(language, "message.retry")}</span>
    </button>
  );
}

function MessageBubble({
  message,
  token,
  onRetry,
  onPreview,
}: {
  message: ChatMessageView;
  token: string;
  onRetry: () => void;
  onPreview: (url: string, name: string) => void;
}) {
  const isFile = message.contentType === "file" && message.file;
  return (
    <div className={`message-bubble ${message.deliveryStatus === "failed" ? "is-failed" : ""}`}>
      {isFile ? (
        <FileBubble
          file={message.file!}
          token={token}
          caption={message.content}
          onPreview={onPreview}
        />
      ) : (
        <p>{message.content}</p>
      )}
      <span className="message-bubble-meta">
        <time>{formatMessageTime(message.timestamp)}</time>
        <DeliveryState message={message} onRetry={onRetry} />
      </span>
      {message.error ? <small className="inline-error">{message.error}</small> : null}
    </div>
  );
}

export function MessageList({ onProfileOpen }: { onProfileOpen: (username: string) => void }) {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const currentUser = useChatStore((state) => state.currentUser);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeCursor = useChatStore((state) => state.historyCursors[state.activeConversationId]);
  const historyLoading = useChatStore((state) => state.historyLoading);
  const messages = useChatStore(useShallow(selectActiveMessages));
  const retryMessage = useChatStore((state) => state.retryMessage);
  const loadOlderHistory = useChatStore((state) => state.loadOlderHistory);
  const setConversationScrollTop = useChatStore((state) => state.setConversationScrollTop);
  const savedScrollTop = useChatStore((state) => state.scrollPositions[state.activeConversationId]);
  const timeline = useMemo(() => buildMessageTimeline(messages), [messages]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const previousCountRef = useRef(messages.length);
  const loadingOlderRef = useRef(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    setNewMessageCount(0);
    previousCountRef.current = messages.length;
    requestAnimationFrame(() => {
      list.scrollTop = savedScrollTop ?? list.scrollHeight;
      nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    });
  }, [activeConversationId]);

  useEffect(() => {
    const list = listRef.current;
    const added = messages.length - previousCountRef.current;
    previousCountRef.current = messages.length;
    if (!list || added <= 0 || loadingOlderRef.current) return;
    if (nearBottomRef.current) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    } else {
      setNewMessageCount((count) => count + added);
    }
  }, [messages.length]);

  async function loadOlder() {
    const list = listRef.current;
    if (!list || historyLoading) return;
    const previousHeight = list.scrollHeight;
    loadingOlderRef.current = true;
    await loadOlderHistory();
    requestAnimationFrame(() => {
      list.scrollTop += list.scrollHeight - previousHeight;
      loadingOlderRef.current = false;
    });
  }

  function jumpToLatest() {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    setNewMessageCount(0);
  }

  return (
    <div className="message-timeline-shell">
      <div
        className="message-timeline"
        ref={listRef}
        onScroll={(event) => {
          const list = event.currentTarget;
          const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
          nearBottomRef.current = nearBottom;
          if (nearBottom) setNewMessageCount(0);
          setConversationScrollTop(activeConversationId, list.scrollTop);
        }}
      >
        <div className="timeline-column">
          {activeCursor ? (
            <button
              type="button"
              className="load-older-button"
              disabled={historyLoading}
              onClick={() => void loadOlder()}
            >
              {historyLoading ? <LoaderCircle className="spin" /> : <RotateCcw />}
              {historyLoading ? t(language, "chat.loading") : t(language, "chat.loadOlder")}
            </button>
          ) : null}

          {timeline.length === 0 ? (
            <div className="message-empty">
              <strong>{t(language, "chat.emptyTitle")}</strong>
              <span>{t(language, "chat.emptyBody")}</span>
            </div>
          ) : null}

          {timeline.map((entry) => {
            if (entry.type === "date") {
              return (
                <div className="date-separator" key={entry.key}>
                  <span>{new Date(entry.timestamp).toLocaleDateString(language, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}</span>
                </div>
              );
            }

            const first = entry.messages[0];
            const isOwn = first.sender.username === currentUser?.username;
            return (
              <section
                className={`message-group ${isOwn ? "is-own" : "is-other"}`}
                key={entry.key}
              >
                {!isOwn ? (
                  <button
                    type="button"
                    className="message-group-avatar"
                    onClick={() => onProfileOpen(first.sender.username)}
                    aria-label={first.sender.nickname}
                  >
                    <Avatar user={first.sender} />
                  </button>
                ) : null}
                <div className="message-group-content">
                  {!isOwn ? (
                    <button
                      type="button"
                      className="message-group-sender"
                      onClick={() => onProfileOpen(first.sender.username)}
                    >
                      {first.sender.nickname}
                    </button>
                  ) : null}
                  <div className="message-bubble-stack">
                    {entry.messages.map((message) => (
                      <MessageBubble
                        key={message.localId}
                        message={message}
                        token={token}
                        onRetry={() => void retryMessage(message.localId)}
                        onPreview={(url, name) => setPreview({ url, name })}
                      />
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {newMessageCount > 0 ? (
        <button type="button" className="new-message-button" onClick={jumpToLatest}>
          {t(language, "chat.newMessages", { count: newMessageCount })}
        </button>
      ) : null}

      {preview ? (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={preview.name}>
          <button type="button" className="lightbox-backdrop" onClick={() => setPreview(null)} />
          <img src={preview.url} alt={preview.name} />
          <IconButton icon={X} label={t(language, "feedback.dismiss")} onClick={() => setPreview(null)} />
        </div>
      ) : null}
    </div>
  );
}
