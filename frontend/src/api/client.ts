import type {
  APIErrorResponse,
  APIResponse,
  AddGroupMemberRequest,
  ChatMessage,
  CreateGroupRequest,
  CreateGroupResponse,
  CurrentUser,
  Group,
  GroupMember,
  LoginRequest,
  LoginResponse,
  OnlineUser,
  RegisterRequest,
  UploadResponse,
  UploadTarget,
  ProfileData,
  ProfileImageKind,
} from "../protocol";

type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE";

export class APIClientError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "APIClientError";
    this.code = code;
    this.status = status;
  }
}

export function createAPIClient(baseURL: string) {
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

    if (response.status === 204) {
      if (!response.ok) {
        throw new APIClientError(`HTTP ${response.status}`, `http_${response.status}`, response.status);
      }
      return undefined as TResponse;
    }

    const data = (await response.json()) as
      | APIResponse<TResponse>
      | APIErrorResponse;

    if (!response.ok) {
      const error =
        "error" in data
          ? data.error
          : { code: `http_${response.status}`, message: `HTTP ${response.status}` };
      throw new APIClientError(error.message, error.code, response.status);
    }

    return (data as APIResponse<TResponse>).data;
  }

  async function requestPage<TResponse>(
    path: string,
    method: HTTPMethod,
    body?: unknown,
    token?: string,
  ): Promise<APIResponse<TResponse>> {
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
      const error =
        "error" in data
          ? data.error
          : { code: `http_${response.status}`, message: `HTTP ${response.status}` };
      throw new APIClientError(error.message, error.code, response.status);
    }

    return data as APIResponse<TResponse>;
  }

  function historyPath(path: string, cursor?: string) {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) {
      query.set("cursor", cursor);
    }
    return `${path}?${query.toString()}`;
  }

  function getDownloadURL(fileID: number) {
    return `${baseURL}/api/v2/files/${fileID}`;
  }

  const client = {
    login: (payload: LoginRequest) =>
      request<LoginResponse>("/api/v2/auth/login", "POST", payload),
    register: (payload: RegisterRequest) =>
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
    getPublicHistoryPage: (token: string, cursor?: string) =>
      requestPage<ChatMessage[]>(
        historyPath("/api/v2/chats/public/history", cursor),
        "GET",
        undefined,
        token,
      ),
    getPrivateHistoryPage: (token: string, username: string, cursor?: string) =>
      requestPage<ChatMessage[]>(
        historyPath(
          `/api/v2/chats/private/${encodeURIComponent(username)}/history`,
          cursor,
        ),
        "GET",
        undefined,
        token,
      ),
    createGroup: (token: string, payload: CreateGroupRequest) =>
      request<CreateGroupResponse>("/api/v2/groups", "POST", payload, token),
    listGroups: (token: string) =>
      request<Group[]>("/api/v2/groups", "GET", undefined, token),
    getGroup: (token: string, groupID: number) =>
      request<Group>(`/api/v2/groups/${groupID}`, "GET", undefined, token),
    getGroupMembers: (token: string, groupID: number) =>
      request<GroupMember[]>(
        `/api/v2/groups/${groupID}/members`,
        "GET",
        undefined,
        token,
      ),
    addGroupMembers: (
      token: string,
      groupID: number,
      payload: AddGroupMemberRequest,
    ) =>
      request<GroupMember[]>(
        `/api/v2/groups/${groupID}/members`,
        "POST",
        payload,
        token,
      ),
    removeGroupMember: (
      token: string,
      groupID: number,
      username: string,
    ) =>
      request<void>(
        `/api/v2/groups/${groupID}/members/${encodeURIComponent(username)}`,
        "DELETE",
        undefined,
        token,
      ),
    getGroupHistoryPage: (
      token: string,
      groupID: number,
      cursor?: string,
    ) =>
      requestPage<ChatMessage[]>(
        historyPath(`/api/v2/groups/${groupID}/history`, cursor),
        "GET",
        undefined,
        token,
      ),
    uploadFile: async (
      token: string,
      file: File,
      target: UploadTarget,
    ): Promise<UploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);
      if (target.scope === "private") {
        formData.append("receiverUsername", target.receiverUsername);
      }
      if (target.scope === "group") {
        formData.append("groupID", String(target.groupID));
      }

      const response = await fetch(`${baseURL}/api/v2/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = (await response.json()) as
        | APIResponse<UploadResponse>
        | APIErrorResponse;

      if (!response.ok) {
        const error =
          "error" in data
            ? data.error
            : { code: `http_${response.status}`, message: `HTTP ${response.status}` };
        throw new APIClientError(error.message, error.code, response.status);
      }

      return (data as APIResponse<UploadResponse>).data;
    },
    getProfile: (token: string, username: string) =>
      request<ProfileData>(
        `/api/v2/users/${encodeURIComponent(username)}/profile`,
        "GET",
        undefined,
        token,
      ),
    updateProfile: (
      token: string,
      username: string,
      payload: {
        nickname?: string;
        bio?: string;
        email?: string;
        gender?: number;
      },
    ) =>
      request<ProfileData>(
        `/api/v2/users/${encodeURIComponent(username)}/profile`,
        "PUT",
        payload,
        token,
      ),
    uploadProfileImage: async (
      token: string,
      username: string,
      kind: ProfileImageKind,
      file: File,
    ): Promise<ProfileData> => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `${baseURL}/api/v2/users/${encodeURIComponent(username)}/${kind}`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: formData },
      );
      const data = (await response.json()) as APIResponse<ProfileData> | APIErrorResponse;
      if (!response.ok) {
        const error = "error" in data
          ? data.error
          : { code: `http_${response.status}`, message: `HTTP ${response.status}` };
        throw new APIClientError(error.message, error.code, response.status);
      }
      return (data as APIResponse<ProfileData>).data;
    },
    getDownloadURL,
  };

  return client;
}
