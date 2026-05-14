export type APIError = {
  code: string;
  message: string;
};

export type APIResponse<T> = {
  data: T;
  nextCursor?: string;
};

export type APIErrorResponse = {
  error: APIError;
};

export type CurrentUser = {
  userId: number;
  username: string;
  nickname: string;
  online?: boolean;
};

export type OnlineUser = {
  userId: number;
  username: string;
  nickname: string;
  online: boolean;
};

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: CurrentUser;
};

export type ChatMessage = {
  messageId: number;
  scope: "public" | "private";
  sender: CurrentUser;
  receiverUsername?: string;
  contentType: "text" | "file";
  content: string;
  timestamp: string;
};

export type SocketEvent<TPayload> = {
  event: string;
  requestId?: string;
  timestamp?: string;
  payload: TPayload;
};

export type RealtimeErrorPayload = {
  code: string;
  message: string;
};
