import { t } from "../i18n";
import { useChatStore } from "../store/chatStore";

export function AuthPanel() {
  const language = useChatStore((state) => state.language);
  const loginForm = useChatStore((state) => state.loginForm);
  const registerForm = useChatStore((state) => state.registerForm);
  const setLoginForm = useChatStore((state) => state.setLoginForm);
  const setRegisterForm = useChatStore((state) => state.setRegisterForm);
  const login = useChatStore((state) => state.login);
  const register = useChatStore((state) => state.register);

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
            onChange={(event) => setLoginForm({ username: event.target.value })}
            placeholder="alice"
          />
        </label>
        <label>
          {t(language, "auth.password")}
          <input
            type="password"
            value={loginForm.password}
            onChange={(event) => setLoginForm({ password: event.target.value })}
            placeholder="secret123"
          />
        </label>
        <button type="button" className="primary-button" onClick={login}>
          {t(language, "auth.submit")}
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
            placeholder="new-user"
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
            placeholder="secret123"
          />
        </label>
        <button type="button" className="secondary-button" onClick={register}>
          {t(language, "auth.register")}
        </button>
      </div>
    </section>
  );
}
