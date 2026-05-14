import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { createAPIClient } from "./api/client";
import type { RealtimeStatus } from "./realtime/client";
import type {
  ChatMessage,
  CurrentUser,
  LoginRequest,
  RegisterRequest,
} from "./protocol";

const httpBaseURL =
  import.meta.env.CHATTER_HTTP_BASE_URL ?? "http://127.0.0.1:8080";
const initialMessages: ChatMessage[] = [
  {
    messageId: 1,
    scope: "public",
    sender: {
      userId: 1,
      username: "system",
      nickname: "System",
      online: true,
    },
    contentType: "text",
    content: "Chatter3 frontend scaffold is ready.",
    timestamp: "2026-05-14T12:00:00Z",
  },
];

export function App() {
  // API client 和 realtime client 都在顶层创建一次，
  // 目的是让组件树里的页面逻辑始终依赖“稳定的客户端实例”，
  // 而不是在每次输入变化时重新创建连接器。
  const api = useMemo(() => createAPIClient(httpBaseURL), []);

  const [token, setToken] = useState("");
  const [loginForm, setLoginForm] = useState<LoginRequest>({
    username: "",
    password: "",
  });
  const [registerForm, setRegisterForm] = useState<RegisterRequest>({
    username: "",
    password: "",
    nickname: "",
  });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSelectedFile, setLastSelectedFile] = useState("");
  const [historyTarget, setHistoryTarget] = useState("");
  const [historyLabel, setHistoryLabel] = useState("Public history");

  async function handleLogin() {
    setError("");
    setNotice("");
    try {
      // 新协议下，登录先走 HTTP，成功后才建立 WebSocket。
      // 这样前端会先拿到 token 和当前用户身份，再进入实时阶段。
      const response = await api.login(loginForm);
      setToken(response.token);
      setCurrentUser(response.user);

      // P2 的初始化同步只负责 HTTP 拉取首屏数据：
      // - 公共聊天历史
      // - 后续按需拉取私聊历史
      //
      // 在线状态依赖“真实在线会话”，它在新路线里应由 WebSocket 驱动，
      // 因此被放到 P3，而不是在登录后伪造一个在线状态列表。
      const history = await api.getPublicHistory(response.token);
      setMessages(history);
      setHistoryLabel("Public history");
      // 先不要在登录成功后自动建立 WebSocket。
      // 当前后端 `/api/v2/ws` 仍然是 501 占位；如果这里强连，
      // 用户会在“登录成功”后立刻看到一个误导性的实时连接错误。
      //
      // P2 阶段先把 HTTP 登录、在线用户、历史消息打通。
      // 等 P3 真正实现 WebSocket 事件循环后，再恢复这里的连接逻辑。
      setStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      setStatus("error");
    }
  }

  async function handleRegister() {
    setError("");
    setNotice("");
    try {
      await api.register(registerForm);
      // 注册成功后不自动登录，避免把“创建账号”和“建立会话”混成一步。
      // 这样前端状态机会更清楚，用户也能显式看到下一步是登录。
      setNotice("Registration succeeded. You can now log in with the new account.");
      setLoginForm({
        username: registerForm.username,
        password: registerForm.password,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
    }
  }

  async function handleLoadPublicHistory() {
    if (!token) {
      setError("Log in first before loading history.");
      return;
    }
    setError("");
    const history = await api.getPublicHistory(token);
    setMessages(history);
    setHistoryLabel("Public history");
  }

  async function handleLoadPrivateHistory() {
    if (!token) {
      setError("Log in first before loading private history.");
      return;
    }
    if (!historyTarget.trim()) {
      setError("Enter a username before loading private history.");
      return;
    }
    setError("");
    const history = await api.getPrivateHistory(token, historyTarget.trim());
    setMessages(history);
    setHistoryLabel(`Private history with ${historyTarget.trim()}`);
  }

  async function handlePickFile() {
    // 文件选择属于典型的桌面能力。
    // 这里通过 Tauri plugin-dialog 暴露的 API 调用系统文件选择器，
    // 而不是自己在 Rust 层再包一层 command。
    const selected = await open({
      multiple: false,
    });
    if (typeof selected === "string") {
      setLastSelectedFile(selected);
    }
  }

  return (
    <div className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Chatter3</p>
          <h1>New desktop client scaffold</h1>
          <p className="lede">
            This app targets the new protocol-v2 contract: HTTP for auth and
            history, WebSocket for realtime events.
          </p>
        </div>
        <div className="status-card">
          <div>
            <span className={`status-dot status-${status}`} />
            <strong>{status}</strong>
          </div>
          <small>HTTP sync is live. WebSocket will be enabled in P3.</small>
        </div>
      </section>

      <main className="layout">
        <section className="panel auth-panel">
          <header>
            <p className="panel-kicker">Session</p>
            <h2>Login</h2>
          </header>
          <label>
            Username
            <input
              value={loginForm.username}
              onChange={(event) =>
                setLoginForm((previous) => ({
                  ...previous,
                  username: event.target.value,
                }))
              }
              placeholder="alice"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((previous) => ({
                  ...previous,
                  password: event.target.value,
                }))
              }
              placeholder="secret123"
            />
          </label>
          <button type="button" onClick={handleLogin}>
            Login via protocol-v2
          </button>
          <header>
            <p className="panel-kicker">Account</p>
            <h2>Register</h2>
          </header>
          <label>
            New username
            <input
              value={registerForm.username}
              onChange={(event) =>
                setRegisterForm((previous) => ({
                  ...previous,
                  username: event.target.value,
                }))
              }
              placeholder="new-user"
            />
          </label>
          <label>
            Nickname
            <input
              value={registerForm.nickname}
              onChange={(event) =>
                setRegisterForm((previous) => ({
                  ...previous,
                  nickname: event.target.value,
                }))
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
                setRegisterForm((previous) => ({
                  ...previous,
                  password: event.target.value,
                }))
              }
              placeholder="secret123"
            />
          </label>
          <button type="button" className="ghost" onClick={handleRegister}>
            Register account
          </button>
          <div className="detail-grid">
            <div>
              <span>HTTP</span>
              <code>{httpBaseURL}</code>
            </div>
            <div>
              <span>Token</span>
              <code>{token ? "present" : "missing"}</code>
            </div>
          </div>
          {currentUser ? (
            <div className="callout success">
              Signed in as <strong>{currentUser.nickname}</strong> (
              {currentUser.username})
            </div>
          ) : null}
          {notice ? <div className="callout neutral">{notice}</div> : null}
          {error ? <div className="callout error">{error}</div> : null}
        </section>

        <section className="panel chat-panel">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">History</p>
              <h2>{historyLabel}</h2>
            </div>
            <button type="button" className="ghost" onClick={handlePickFile}>
              Pick file
            </button>
          </header>
          <div className="message-list">
            {messages.map((message) => (
              <article key={message.messageId} className="message-card">
                <div className="message-meta">
                  <strong>{message.sender.nickname}</strong>
                  <span>{message.timestamp}</span>
                </div>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
          <div className="composer">
            <input disabled placeholder="Message sending will be wired next." />
            <button disabled type="button">
              Send
            </button>
          </div>
          {lastSelectedFile ? (
            <div className="callout neutral">Selected file: {lastSelectedFile}</div>
          ) : null}
        </section>

        <aside className="panel side-panel">
          <header>
            <p className="panel-kicker">History Tools</p>
            <h2>Load conversation data</h2>
          </header>
          <button type="button" onClick={handleLoadPublicHistory}>
            Reload public history
          </button>
          <label>
            Private history username
            <input
              value={historyTarget}
              onChange={(event) => setHistoryTarget(event.target.value)}
              placeholder="bob"
            />
          </label>
          <button type="button" className="ghost" onClick={handleLoadPrivateHistory}>
            Load private history
          </button>
          <div className="callout neutral">
            Presence and realtime delivery move to P3, because they depend on a
            real WebSocket-backed online session rather than a plain HTTP login.
          </div>
          <div className="protocol-card">
            <h3>Next integration steps</h3>
            <ol>
              <li>
                ✅ Register and log in via HTTP
              </li>
              <li>✅ Load public and private history via HTTP</li>
              <li>
                Wire presence and realtime events from <code>/api/v2/ws</code> (P3)
              </li>
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
