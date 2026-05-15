import { useChatStore } from "../store/chatStore";

export function IdentityPanel() {
  const token = useChatStore((state) => state.token);
  const currentUser = useChatStore((state) => state.currentUser);
  const error = useChatStore((state) => state.error);
  const authExpired = useChatStore((state) => state.authExpired);
  const notice = useChatStore((state) => state.notice);
  const clearError = useChatStore((state) => state.clearError);

  return (
    <section className="panel identity-panel">
      <p className="section-label">Identity</p>
      {currentUser ? (
        <div className="identity-card">
          <strong>{currentUser.nickname}</strong>
          <span>@{currentUser.username}</span>
          <small>{token ? "jwt session active" : "session missing"}</small>
        </div>
      ) : (
        <div className="identity-card identity-card-muted">
          <strong>Guest node</strong>
          <span>sign in to enter the mesh</span>
        </div>
      )}
      {notice ? <div className="callout neutral">{notice}</div> : null}
      {error ? (
        <div className="callout error">
          <span>{error}</span>
          {authExpired ? (
            <button type="button" onClick={clearError}>
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
