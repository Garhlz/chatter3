import { useState } from "react";
import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function AuthPanel() {
  const language = useChatStore((state) => state.language);
  const loginForm = useChatStore((state) => state.loginForm);
  const registerForm = useChatStore((state) => state.registerForm);
  const error = useChatStore((state) => state.error);
  const setLoginForm = useChatStore((state) => state.setLoginForm);
  const setRegisterForm = useChatStore((state) => state.setRegisterForm);
  const login = useChatStore((state) => state.login);
  const register = useChatStore((state) => state.register);
  const [loginLoading, setLoginLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  return (
    <section className="panel auth-panel">
      <div className="form-block">
        <header className="panel-header panel-header-tight">
          <div>
            <p className="section-label">{t(language, "auth.access")}</p>
            <h2>{t(language, "auth.login")}</h2>
          </div>
        </header>
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
      </div>

      <div className="divider" />

      <div className="form-block">
        <header className="panel-header panel-header-tight">
          <div>
            <p className="section-label">{t(language, "auth.provision")}</p>
            <h2>{t(language, "auth.createAccount")}</h2>
          </div>
        </header>
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
          className="secondary-button"
          disabled={registerLoading}
          onClick={() => {
            setRegisterLoading(true);
            register().finally(() => setRegisterLoading(false)).catch(() => {});
          }}
        >
          {registerLoading ? t(language, "auth.registering") : t(language, "auth.register")}
        </button>
      </div>

      {error ? (
        <div className="callout error auth-feedback" role="alert">
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}
