import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function GlobalFeedback() {
  const language = useChatStore((state) => state.language);
  const error = useChatStore((state) => state.error);
  const authExpired = useChatStore((state) => state.authExpired);
  const notice = useChatStore((state) => state.notice);
  const clearError = useChatStore((state) => state.clearError);
  const clearNotice = useChatStore((state) => state.clearNotice);

  if (!notice && !error) {
    return null;
  }

  return (
    <section className="feedback-stack" aria-live="polite">
      {notice ? (
        <div className="callout neutral feedback-card">
          <div className="feedback-copy">
            <strong>{t(language, "feedback.notice")}</strong>
            <span>{notice}</span>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={clearNotice}
          >
            {t(language, "feedback.dismiss")}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="callout error feedback-card" role="alert">
          <div className="feedback-copy">
            <strong>
              {authExpired
                ? t(language, "feedback.sessionExpired")
                : t(language, "feedback.error")}
            </strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={clearError}
          >
            {t(language, "feedback.dismiss")}
          </button>
        </div>
      ) : null}
    </section>
  );
}
