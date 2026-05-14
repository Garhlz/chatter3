import type {
  APIErrorResponse,
  APIResponse,
  ChatMessage,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  OnlineUser,
  RegisterRequest,
} from "../protocol";

type HTTPMethod = "GET" | "POST";

export function createAPIClient(baseURL: string) {
  // 这里集中封装 protocol-v2 的 HTTP 访问。
  // 这样做的目的，是把“接口细节”从页面组件里挪走：
  // 页面只表达用户动作，API client 负责请求路径、鉴权头和错误拆解。
  //
  // 对这个项目来说，这层尤其重要，因为当前前端还在快速演进：
  // - 页面结构会变化
  // - 状态管理方式后面可能会升级
  // - 但后端协议入口应尽量稳定
  //
  // 把 fetch 收口到这里，可以避免“每个组件各写一套请求细节”，
  // 否则后面一旦字段名或错误结构变更，会出现大量分散改动。
  async function request<TResponse>(
    path: string,
    method: HTTPMethod,
    body?: unknown,
    token?: string,
  ): Promise<TResponse> {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as
      | APIResponse<TResponse>
      | APIErrorResponse;

    if (!response.ok) {
      // 后端 v2 约定失败时返回 { error: { code, message } }。
      // 这里先把它统一转成 Error，前端页面暂时只关心“能否展示一条可读错误”。
      const message =
        "error" in data ? data.error.message : `HTTP ${response.status}`;
      throw new Error(message);
    }

    return (data as APIResponse<TResponse>).data;
  }

  return {
    // 认证接口：
    // - register 负责创建账号
    // - login 负责建立身份并拿到 token
    //
    // 当前故意不让 register 自动替代 login，
    // 因为“创建账号”和“进入已认证会话”是两个不同状态转换。
    login: (payload: LoginRequest) =>
      request<LoginResponse>("/api/v2/auth/login", "POST", payload),
    register: (payload: RegisterRequest) =>
      request<{ user: CurrentUser }>("/api/v2/auth/register", "POST", payload),
    // 历史与列表接口仍然走 HTTP。
    // 这是 protocol-v2 的固定设计：历史拉取与实时事件分离。
    getOnlineUsers: (token: string) =>
      request<OnlineUser[]>("/api/v2/users/online", "GET", undefined, token),
    getPublicHistory: (token: string) =>
      request<ChatMessage[]>(
        "/api/v2/chats/public/history?limit=50",
        "GET",
        undefined,
        token,
      ),
    getPrivateHistory: (token: string, username: string) =>
      request<ChatMessage[]>(
        `/api/v2/chats/private/${encodeURIComponent(username)}/history?limit=50`,
        "GET",
        undefined,
        token,
      ),
  };
}
