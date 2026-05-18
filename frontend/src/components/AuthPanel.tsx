import { useState } from "react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function AuthPanel() {
  const language = useChatStore((state) => state.language);
  const status = useChatStore((state) => state.status);
  const loginForm = useChatStore((state) => state.loginForm);
  const registerForm = useChatStore((state) => state.registerForm);
  const error = useChatStore((state) => state.error);
  const setLoginForm = useChatStore((state) => state.setLoginForm);
  const setRegisterForm = useChatStore((state) => state.setRegisterForm);
  const login = useChatStore((state) => state.login);
  const register = useChatStore((state) => state.register);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <section className="panel auth-panel">
      <div className="auth-panel-copy">
        <div className="auth-panel-copy-head">
          <p className="section-label">{t(language, "app.eyebrow")}</p>
          <h2>{t(language, "auth.welcomeTitle")}</h2>
          <p className="auth-panel-copy-body">{t(language, "auth.welcomeBody")}</p>
        </div>

        <div className="auth-feature-list">
          <div className="auth-feature-item">
            <span className={`status-dot status-${status}`} />
            <strong>{t(language, "auth.welcomeRealtime")}</strong>
          </div>
          <div className="auth-feature-item">
            <span className="status-dot status-connected" />
            <strong>{t(language, "auth.welcomeHistory")}</strong>
          </div>
          <div className="auth-feature-item">
            <span className="status-dot status-idle" />
            <strong>{t(language, "auth.welcomeDesktop")}</strong>
          </div>
        </div>
      </div>

      <div className="divider" />

      <div className="auth-panel-forms">
        <div className="panel auth-form-card">
          <div className="form-block">
            <header className="panel-header panel-header-tight">
              <div>
                <p className="section-label">
                  {mode === "login"
                    ? t(language, "auth.access")
                    : t(language, "auth.provision")}
                </p>
                <h2>
                  {mode === "login"
                    ? t(language, "auth.login")
                    : t(language, "auth.createAccount")}
                </h2>
              </div>
            </header>
            {mode === "login" ? (
              <>
                <label>
                  {t(language, "auth.username")}
                  <input
                    value={loginForm.username}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loginLoading) {
                        setLoginLoading(true);
                        login().finally(() => setLoginLoading(false)).catch(() => {});
                      }
                    }}
                    onChange={(event) => setLoginForm({ username: event.target.value })}
                    placeholder={t(language, "auth.usernamePlaceholder")}
                    disabled={loginLoading}
                  />
                </label>
                <label>
                  {t(language, "auth.password")}
                  <input
                    type="password"
                    value={loginForm.password}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loginLoading) {
                        setLoginLoading(true);
                        login().finally(() => setLoginLoading(false)).catch(() => {});
                      }
                    }}
                    onChange={(event) => setLoginForm({ password: event.target.value })}
                    placeholder={t(language, "auth.passwordPlaceholder")}
                    disabled={loginLoading}
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={loginLoading}
                  onClick={() => {
                    setLoginLoading(true);
                    login().finally(() => setLoginLoading(false)).catch(() => {});
                  }}
                >
                  {loginLoading ? t(language, "auth.loggingIn") : t(language, "auth.submit")}
                </button>
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => setMode("register")}
                  disabled={loginLoading}
                >
                  {t(language, "auth.switchToRegister")}
                </button>
              </>
            ) : (
              <>
                <label>
                  {t(language, "auth.newUsername")}
                  <input
                    value={registerForm.username}
                    onChange={(event) =>
                      setRegisterForm({ username: event.target.value })
                    }
                    placeholder={t(language, "auth.usernamePlaceholder")}
                    disabled={registerLoading}
                  />
                </label>
                <label>
                  {t(language, "auth.nickname")}
                  <input
                    value={registerForm.nickname}
                    onChange={(event) =>
                      setRegisterForm({ nickname: event.target.value })
                    }
                    placeholder={t(language, "auth.nicknamePlaceholder")}
                    disabled={registerLoading}
                  />
                </label>
                <label>
                  {t(language, "auth.newPassword")}
                  <input
                    type="password"
                    value={registerForm.password}
                    onChange={(event) =>
                      setRegisterForm({ password: event.target.value })
                    }
                    placeholder={t(language, "auth.passwordPlaceholder")}
                    disabled={registerLoading}
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={registerLoading}
                  onClick={() => {
                    setRegisterLoading(true);
                    register().finally(() => setRegisterLoading(false)).catch(() => {});
                  }}
                >
                  {registerLoading ? t(language, "auth.registering") : t(language, "auth.register")}
                </button>
                <button
                  type="button"
                  className="auth-switch-link"
                  onClick={() => setMode("login")}
                  disabled={registerLoading}
                >
                  {t(language, "auth.switchToLogin")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <div className="callout error auth-feedback" role="alert">
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}
