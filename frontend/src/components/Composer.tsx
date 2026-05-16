import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function Composer() {
  const language = useChatStore((state) => state.language);
  const token = useChatStore((state) => state.token);
  const status = useChatStore((state) => state.status);
  const reconnectAttempt = useChatStore((state) => state.reconnectAttempt);
  const draft = useChatStore((state) => state.draft);
  const activeConversation = useChatStore((state) =>
    state.conversations[state.activeConversationId],
  );
  const setDraft = useChatStore((state) => state.setDraft);
  const sendMessage = useChatStore((state) => state.sendMessage);

  const isConnected = status === "connected";
  const composerHint = !token
    ? t(language, "composer.needAuth")
    : isConnected
      ? t(language, "composer.ready")
      : reconnectAttempt > 0
        ? t(language, "composer.reconnecting", { attempt: reconnectAttempt })
        : t(language, "composer.offline");
  const composerPlaceholder =
    activeConversation?.scope === "private"
      ? t(language, "composer.privatePlaceholder", {
          name: activeConversation.peerUsername || t(language, "composer.selectedUser"),
        })
      : activeConversation?.scope === "group"
        ? t(language, "composer.groupPlaceholder", { name: activeConversation.title })
        : t(language, "composer.publicPlaceholder");

  return (
    <div className="composer">
      <div className="composer-field">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          disabled={!token || status !== "connected"}
          placeholder={composerPlaceholder}
        />
        <small>{composerHint}</small>
      </div>
      <button
        type="button"
        className="primary-button"
        disabled={!draft.trim() || !token || status !== "connected"}
        onClick={sendMessage}
      >
        {t(language, "composer.send")}
      </button>
    </div>
  );
}
