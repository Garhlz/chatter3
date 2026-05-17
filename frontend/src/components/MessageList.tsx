import { useEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { httpBaseURL } from "../config";
import { t } from "../i18n";
import { formatMessageTime } from "./format";
import { cli } from "./utils";
import {
  selectActiveMessages,
  useChatStore,
} from "../store/chatStore";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MessageList({ onProfileOpen }: { onProfileOpen: (username: string) => void }) {
  const language = useChatStore((state) => state.language);
  const currentUser = useChatStore((state) => state.currentUser);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeScrollTop = useChatStore(
    (state) => state.scrollPositions[state.activeConversationId],
  );
  const messages = useChatStore(useShallow(selectActiveMessages));
  const retryMessage = useChatStore((state) => state.retryMessage);
  const setConversationScrollTop = useChatStore(
    (state) => state.setConversationScrollTop,
  );
  const messageListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) {
      return;
    }
    if (activeScrollTop !== undefined) {
      list.scrollTop = activeScrollTop;
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [activeConversationId, activeScrollTop, messages.length]);

  return (
    <div
      className="message-list"
      ref={messageListRef}
      onScroll={(event) =>
        setConversationScrollTop(
          activeConversationId,
          event.currentTarget.scrollTop,
        )
      }
    >
      {messages.length > 0 ? (
        messages.map((message) => {
          const isOwn =
            currentUser?.username !== undefined &&
            currentUser.username === message.sender.username;
          const isFile = message.contentType === "file" && message.file;

          return (
            <article
              key={message.localId}
              className={`message-card ${isOwn ? "message-card-own" : ""} ${
                message.deliveryStatus === "failed" ? "message-card-failed" : ""
              }`}
            >
              <div className="message-meta">
                <button
                  type="button"
                  className="message-sender-clickable"
                  onClick={() => onProfileOpen(message.sender.username)}
                >
                  {message.sender.nickname}
                </button>
                <span>{formatMessageTime(message.timestamp)}</span>
              </div>

              {isFile ? (
                <div className="file-card">
                  <div className="file-card-info">
                      {message.file!.mimeType?.startsWith("image/") && (
                        <img
                          src={httpBaseURL + message.file!.downloadURL}
                          alt={message.file!.fileName}
                          className="file-preview-img"
                        />
                      )}
                    <span className="file-card-name">
                      {message.file!.fileName}
                    </span>
                    <span className="file-card-size">
                      {formatFileSize(message.file!.size)} · {message.file!.mimeType}
                    </span>
                  </div>
                  <a
                    className="file-card-download primary-button compact-button"
                    href={httpBaseURL + message.file!.downloadURL}
                    download={message.file!.fileName}
                  >
                    {t(language, "message.download")}
                  </a>
                  {message.content ? (
                    <p className="file-card-caption">{message.content}</p>
                  ) : null}
                </div>
              ) : (
                <p>{message.content}</p>
              )}

              {message.deliveryStatus !== "sent" ? (
                <div className="message-status">
                  <span>
                    {message.deliveryStatus === "sending"
                      ? t(language, "message.status.sending")
                      : t(language, "message.status.failed")}
                  </span>
                  {message.error ? <small>{message.error}</small> : null}
                  {message.deliveryStatus === "failed" ? (
                    <button
                      type="button"
                      onClick={cli(() => retryMessage(message.localId))}
                    >
                      {t(language, "message.retry")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })
      ) : (
        <div className="transmission-empty">
          <span>{t(language, "chat.emptyKicker")}</span>
          <strong>{t(language, "chat.emptyTitle")}</strong>
          <p>{t(language, "chat.emptyBody")}</p>
        </div>
      )}
    </div>
  );
}
