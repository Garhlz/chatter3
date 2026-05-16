import { t, type Language } from "../i18n";
import { useChatStore } from "../store/chatStore";
import type { ThemeMode } from "../theme";

export function IdentityPanel() {
  const language = useChatStore((state) => state.language);
  const themeMode = useChatStore((state) => state.themeMode);
  const setLanguage = useChatStore((state) => state.setLanguage);
  const setThemeMode = useChatStore((state) => state.setThemeMode);
  const token = useChatStore((state) => state.token);
  const currentUser = useChatStore((state) => state.currentUser);
  const error = useChatStore((state) => state.error);
  const authExpired = useChatStore((state) => state.authExpired);
  const notice = useChatStore((state) => state.notice);
  const clearError = useChatStore((state) => state.clearError);

  return (
    <section className="panel identity-panel">
      <div className="panel-header panel-header-tight">
        <p className="section-label">{t(language, "identity.title")}</p>
        <div className="preference-switches">
          <label className="preference-switch">
            <span>{t(language, "identity.language")}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="zh-CN">中文</option>
              <option value="en-US">EN</option>
            </select>
          </label>
          <label className="preference-switch">
            <span>{t(language, "identity.theme")}</span>
            <select
              value={themeMode}
              onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
            >
              <option value="system">{t(language, "theme.system")}</option>
              <option value="latte">{t(language, "theme.latte")}</option>
              <option value="one-dark">{t(language, "theme.oneDark")}</option>
            </select>
          </label>
        </div>
      </div>
      {currentUser ? (
        <div className="identity-card">
          <strong>{currentUser.nickname}</strong>
          <span>@{currentUser.username}</span>
          <small>{token ? t(language, "identity.sessionActive") : t(language, "identity.sessionMissing")}</small>
        </div>
      ) : (
        <div className="identity-card identity-card-muted">
          <strong>{t(language, "identity.guest")}</strong>
          <span>{t(language, "identity.guestHint")}</span>
        </div>
      )}
      {notice ? <div className="callout neutral">{notice}</div> : null}
      {error ? (
        <div className="callout error">
          <span>{error}</span>
          {authExpired ? (
            <button type="button" onClick={clearError}>
              {t(language, "identity.dismiss")}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
