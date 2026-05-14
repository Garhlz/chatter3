import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { createAPIClient } from "./api/client";
import { createRealtimeClient, type RealtimeStatus } from "./realtime/client";
import type { ChatMessage, CurrentUser, LoginRequest, OnlineUser } from "./protocol";

const httpBaseURL =
  import.meta.env.CHATTER_HTTP_BASE_URL ?? "http://127.0.0.1:8080";
const wsURL =
  import.meta.env.CHATTER_WS_URL ?? "ws://127.0.0.1:8080/api/v2/ws";

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
  const realtime = useMemo(() => createRealtimeClient(wsURL), []);

  const [token, setToken] = useState("");
  const [loginForm, setLoginForm] = useState<LoginRequest>({
    username: "",
    password: "",
  });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [messages] = useState<ChatMessage[]>(initialMessages);
  const [onlineUsers] = useState<OnlineUser[]>([]);
  const [error, setError] = useState("");
  const [lastSelectedFile, setLastSelectedFile] = useState("");

  async function handleLogin() {
    setError("");
    try {
      // 新协议下，登录先走 HTTP，成功后才建立 WebSocket。
      // 这样前端会先拿到 token 和当前用户身份，再进入实时阶段。
      const response = await api.login(loginForm);
      setToken(response.token);
      setCurrentUser(response.user);
      setStatus("connecting");
      realtime.connect(response.token, {
        onStatusChange: setStatus,
        onError: setError,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      setStatus("error");
    }
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
          <small>{wsURL}</small>
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
          {error ? <div className="callout error">{error}</div> : null}
        </section>

        <section className="panel chat-panel">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">Realtime</p>
              <h2>Public chat scaffold</h2>
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
            <p className="panel-kicker">Presence</p>
            <h2>Online users</h2>
          </header>
          <ul className="user-list">
            {onlineUsers.length === 0 ? (
              <li className="muted">No users loaded yet.</li>
            ) : (
              onlineUsers.map((user) => (
                <li key={user.userId}>
                  <strong>{user.nickname}</strong>
                  <span>{user.username}</span>
                </li>
              ))
            )}
          </ul>
          <div className="protocol-card">
            <h3>Next integration steps</h3>
            <ol>
              <li>Wire login endpoint `/api/v2/auth/login`</li>
              <li>Load public/private history via HTTP</li>
              <li>Append realtime events from `/api/v2/ws`</li>
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
