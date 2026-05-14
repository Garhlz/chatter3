import type {
  APIErrorResponse,
  APIResponse,
  ChatMessage,
  CurrentUser,
  LoginRequest,
  LoginResponse,
  OnlineUser,
} from "../protocol";

type HTTPMethod = "GET" | "POST";

export function createAPIClient(baseURL: string) {
  // 这里集中封装 protocol-v2 的 HTTP 访问。
  // 这样做的目的，是把“接口细节”从页面组件里挪走：
  // 页面只表达用户动作，API client 负责请求路径、鉴权头和错误拆解。
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
    login: (payload: LoginRequest) =>
      request<LoginResponse>("/api/v2/auth/login", "POST", payload),
    register: (payload: CurrentUser & { password: string }) =>
      request<{ user: CurrentUser }>("/api/v2/auth/register", "POST", payload),
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
