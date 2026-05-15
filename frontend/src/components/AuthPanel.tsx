import { useChatStore } from "../store/chatStore";

export function AuthPanel() {
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
            <p className="section-label">Access</p>
            <h2>Login</h2>
          </div>
        </header>
        <label>
          Username
          <input
            value={loginForm.username}
            onChange={(event) => setLoginForm({ username: event.target.value })}
            placeholder="alice"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={loginForm.password}
            onChange={(event) => setLoginForm({ password: event.target.value })}
            placeholder="secret123"
          />
        </label>
        <button type="button" className="primary-button" onClick={login}>
          Open channel
        </button>
      </div>

      <div className="divider" />

      <div className="form-block">
        <header className="panel-header panel-header-tight">
          <div>
            <p className="section-label">Provision</p>
            <h2>Create account</h2>
          </div>
        </header>
        <label>
          New username
          <input
            value={registerForm.username}
            onChange={(event) =>
              setRegisterForm({ username: event.target.value })
            }
            placeholder="new-user"
          />
        </label>
        <label>
          Nickname
          <input
            value={registerForm.nickname}
            onChange={(event) =>
              setRegisterForm({ nickname: event.target.value })
            }
            placeholder="Friendly name"
          />
        </label>
        <label>
          New password
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
          Register node
        </button>
      </div>
    </section>
  );
}
