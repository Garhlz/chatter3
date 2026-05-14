import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { createAPIClient } from "./api/client";
import { createRealtimeClient, type RealtimeStatus } from "./realtime/client";
import type {
  ChatMessage,
  CurrentUser,
  LoginRequest,
  OnlineUser,
  RegisterRequest,
} from "./protocol";

const httpBaseURL = import.meta.env.CHATTER_HTTP_BASE_URL ?? "";
const wsBaseURL =
  import.meta.env.CHATTER_WS_URL ??
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
    window.location.host
  }/api/v2/ws`;

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
  const api = useMemo(() => createAPIClient(httpBaseURL), []);
  const realtime = useMemo(() => createRealtimeClient(wsBaseURL), []);

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
  const [historyLabel, setHistoryLabel] = useState("Public Lobby");
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [draft, setDraft] = useState("");
  const currentUserRef = useRef<CurrentUser | null>(null);
  const historyViewRef = useRef<{ scope: "public" | "private"; peer: string }>({
    scope: "public",
    peer: "",
  });

  useEffect(() => {
    return () => {
      realtime.disconnect();
    };
  }, [realtime]);

  function upsertOnlineUser(user: OnlineUser) {
    setOnlineUsers((previous) => {
      const filtered = previous.filter(
        (entry) => entry.username !== user.username,
      );
      if (!user.online) {
        return filtered;
      }
      return [...filtered, user].sort((left, right) =>
        left.username.localeCompare(right.username),
      );
    });
  }

  function maybeAppendRealtimeMessage(message: ChatMessage) {
    const current = currentUserRef.current;
    const view = historyViewRef.current;

    if (view.scope === "public" && message.scope === "public") {
      setMessages((previous) => [...previous, message]);
      return;
    }
    if (view.scope !== "private" || message.scope !== "private" || !current) {
      return;
    }

    const peer =
      message.sender.username === current.username
        ? message.receiverUsername ?? ""
        : message.sender.username;
    if (peer === view.peer) {
      setMessages((previous) => [...previous, message]);
    }
  }

  async function handleLogin() {
    setError("");
    setNotice("");
    try {
      const response = await api.login(loginForm);
      setToken(response.token);
      setCurrentUser(response.user);
      currentUserRef.current = response.user;

      const [history, users] = await Promise.all([
        api.getPublicHistory(response.token),
        api.getOnlineUsers(response.token),
      ]);
      setMessages(history);
      setHistoryLabel("Public Lobby");
      historyViewRef.current = { scope: "public", peer: "" };
      setOnlineUsers(users);

      realtime.connect(response.token, {
        onStatusChange: setStatus,
        onError: setError,
        onReady: (payload) => {
          currentUserRef.current = payload.user;
          setCurrentUser(payload.user);
          setNotice(
            `Realtime session ready. Heartbeat timeout: ${payload.heartbeatTimeout}`,
          );
        },
        onPresence: ({ user }) => {
          upsertOnlineUser(user);
        },
        onPublicMessage: (message) => {
          maybeAppendRealtimeMessage(message);
        },
        onPrivateMessage: (message) => {
          maybeAppendRealtimeMessage(message);
        },
      });
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
    setHistoryLabel("Public Lobby");
    historyViewRef.current = { scope: "public", peer: "" };
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
    const peer = historyTarget.trim();
    const history = await api.getPrivateHistory(token, peer);
    setMessages(history);
    setHistoryLabel(`Direct messages with ${peer}`);
    historyViewRef.current = { scope: "private", peer };
    setHistoryTarget(peer);
  }

  async function handleOpenDirectHistory(username: string) {
    setHistoryTarget(username);
    if (!token) {
      return;
    }
    setError("");
    const history = await api.getPrivateHistory(token, username);
    setMessages(history);
    setHistoryLabel(`Direct messages with ${username}`);
    historyViewRef.current = { scope: "private", peer: username };
  }

  async function handlePickFile() {
    const selected = await open({
      multiple: false,
    });
    if (typeof selected === "string") {
      setLastSelectedFile(selected);
    }
  }

  function handleSendMessage() {
    const content = draft.trim();
    if (!content) {
      return;
    }
    if (!token || status !== "connected") {
      setError("Connect the realtime session before sending messages.");
      return;
    }

    setError("");
    if (historyViewRef.current.scope === "public") {
      realtime.sendPublicMessage({ content });
    } else {
      const receiverUsername = historyViewRef.current.peer;
      if (!receiverUsername) {
        setError("Choose a private conversation before sending a direct message.");
        return;
      }
      realtime.sendPrivateMessage({
        receiverUsername,
        content,
      });
    }
    setDraft("");
  }

  const historyScopeLabel =
    historyViewRef.current.scope === "public" ? "Lobby" : "Direct";
  const composerPlaceholder =
    historyViewRef.current.scope === "public"
      ? "Send a message to the public lobby"
      : `Send a direct message to ${historyViewRef.current.peer || "selected user"}`;

  return (
    <div className="desktop-shell">
      <header className="topbar">
        <div>
          <p className="topbar-eyebrow">Chatter3</p>
          <h1>Desktop Client</h1>
        </div>
        <div className="topbar-status">
          <span className={`status-dot status-${status}`} />
          <div>
            <strong>{status}</strong>
            <small>
              {currentUser
                ? `Signed in as ${currentUser.nickname}`
                : "Authenticate to enter a realtime session."}
            </small>
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="rail left-rail">
          <section className="panel account-panel">
            <p className="section-label">Account</p>
            {currentUser ? (
              <div className="identity-card">
                <strong>{currentUser.nickname}</strong>
                <span>@{currentUser.username}</span>
                <small>{token ? "JWT session active" : "Session missing"}</small>
              </div>
            ) : (
              <div className="identity-card identity-card-muted">
                <strong>Not signed in</strong>
                <span>Use the login form below.</span>
              </div>
            )}
            {notice ? <div className="callout neutral">{notice}</div> : null}
            {error ? <div className="callout error">{error}</div> : null}
          </section>

          <section className="panel auth-panel">
            <div className="form-block">
              <header className="panel-header panel-header-tight">
                <div>
                  <p className="section-label">Session</p>
                  <h2>Login</h2>
                </div>
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
              <button type="button" className="primary-button" onClick={handleLogin}>
                Enter workspace
              </button>
            </div>

            <div className="divider" />

            <div className="form-block">
              <header className="panel-header panel-header-tight">
                <div>
                  <p className="section-label">Provisioning</p>
                  <h2>Create account</h2>
                </div>
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
              <button
                type="button"
                className="secondary-button"
                onClick={handleRegister}
              >
                Register
              </button>
            </div>
          </section>
        </aside>

        <section className="stage">
          <section className="panel conversation-panel">
            <header className="conversation-header">
              <div>
                <p className="section-label">Conversation</p>
                <h2>{historyLabel}</h2>
              </div>
              <div className="header-actions">
                <span className="scope-badge">{historyScopeLabel}</span>
                <button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={handlePickFile}
                >
                  Pick file
                </button>
              </div>
            </header>

            <div className="message-list">
              {messages.map((message) => {
                const isOwn =
                  currentUser?.username !== undefined &&
                  currentUser.username === message.sender.username;

                return (
                  <article
                    key={message.messageId}
                    className={`message-card ${isOwn ? "message-card-own" : ""}`}
                  >
                    <div className="message-meta">
                      <strong>{message.sender.nickname}</strong>
                      <span>{message.timestamp}</span>
                    </div>
                    <p>{message.content}</p>
                  </article>
                );
              })}
            </div>

            <div className="composer">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={!token || status !== "connected"}
                placeholder={composerPlaceholder}
              />
              <button
                type="button"
                className="primary-button"
                disabled={!draft.trim() || !token || status !== "connected"}
                onClick={handleSendMessage}
              >
                Send
              </button>
            </div>
          </section>
        </section>

        <aside className="rail right-rail">
          <section className="panel connection-panel">
            <p className="section-label">Realtime</p>
            <div className="connection-summary">
              <div>
                <span className={`status-dot status-${status}`} />
                <strong>{status}</strong>
              </div>
              <small>
                HTTP seeds the first screen. WebSocket keeps presence and message
                flow live.
              </small>
            </div>
            <div className="detail-grid">
              <div>
                <span>HTTP</span>
                <code>{httpBaseURL || "/api via Vite proxy"}</code>
              </div>
              <div>
                <span>WS</span>
                <code>{wsBaseURL}</code>
              </div>
              <div>
                <span>Token</span>
                <code>{token ? "present" : "missing"}</code>
              </div>
            </div>
          </section>

          <section className="panel people-panel">
            <header className="panel-header panel-header-tight">
              <div>
                <p className="section-label">Presence</p>
                <h2>Online users</h2>
              </div>
              <span className="count-badge">{onlineUsers.length}</span>
            </header>
            <ul className="user-list">
              {onlineUsers.length > 0 ? (
                onlineUsers.map((user) => (
                  <li key={user.username}>
                    <button
                      type="button"
                      className="user-card-button"
                      onClick={() => handleOpenDirectHistory(user.username)}
                    >
                      <strong>{user.nickname}</strong>
                      <span>@{user.username}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="empty-state">
                  <strong>No active users</strong>
                  <span>Presence events will populate this list.</span>
                </li>
              )}
            </ul>
          </section>

          <section className="panel tools-panel">
            <header className="panel-header panel-header-tight">
              <div>
                <p className="section-label">Tools</p>
                <h2>History and files</h2>
              </div>
            </header>
            <button
              type="button"
              className="secondary-button"
              onClick={handleLoadPublicHistory}
            >
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
            <button
              type="button"
              className="secondary-button"
              onClick={handleLoadPrivateHistory}
            >
              Load direct messages
            </button>
            {lastSelectedFile ? (
              <div className="callout neutral">
                Selected file:
                <br />
                {lastSelectedFile}
              </div>
            ) : (
              <div className="callout muted-callout">
                No file selected yet. This area stays as the desktop-bridge slot for
                later upload work.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
