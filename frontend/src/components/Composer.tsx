import { useChatStore } from "../store/chatStore";

export function Composer() {
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
    ? "Authenticate before transmitting."
    : isConnected
      ? "Press Enter to transmit. Failed messages can be retried."
      : reconnectAttempt > 0
        ? `Realtime link is reconnecting. Attempt ${reconnectAttempt}.`
        : "Realtime link is not connected.";
  const composerPlaceholder =
    activeConversation?.scope === "private"
      ? `Send a direct message to ${
          activeConversation.peerUsername || "selected user"
        }`
      : activeConversation?.scope === "group"
        ? `Send a message to ${activeConversation.title}`
        : "Send a message to the public lobby";

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
        Transmit
      </button>
    </div>
  );
}
