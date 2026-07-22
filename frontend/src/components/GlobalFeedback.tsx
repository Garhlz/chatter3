import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useEffect } from "react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";
import { IconButton } from "./ui/IconButton";

export function GlobalFeedback() {
  const language = useChatStore((state) => state.language);
  const error = useChatStore((state) => state.error);
  const authExpired = useChatStore((state) => state.authExpired);
  const notice = useChatStore((state) => state.notice);
  const clearError = useChatStore((state) => state.clearError);
  const clearNotice = useChatStore((state) => state.clearNotice);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(clearNotice, 3000);
    return () => window.clearTimeout(timer);
  }, [clearNotice, notice]);

  if (!notice && !error) return null;

  return (
    <>
      {authExpired && error ? (
        <section className="session-expired-banner" role="alert">
          <AlertCircle aria-hidden="true" />
          <div>
            <strong>{t(language, "feedback.sessionExpired")}</strong>
            <span>{error}</span>
          </div>
          <IconButton icon={X} label={t(language, "feedback.dismiss")} onClick={clearError} />
        </section>
      ) : null}

      <section className="toast-viewport" aria-live="polite" aria-atomic="true">
        {notice ? (
          <div className="toast toast-success">
            <CheckCircle2 aria-hidden="true" />
            <span>{notice}</span>
            <IconButton icon={X} label={t(language, "feedback.dismiss")} size="small" onClick={clearNotice} />
          </div>
        ) : null}
        {error && !authExpired ? (
          <div className="toast toast-error" role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{error}</span>
            <IconButton icon={X} label={t(language, "feedback.dismiss")} size="small" onClick={clearError} />
          </div>
        ) : null}
      </section>
    </>
  );
}
