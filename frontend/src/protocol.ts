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

export type RegisterRequest = {
  username: string;
  password: string;
  nickname: string;
};

export type LoginResponse = {
  token: string;
  user: CurrentUser;
};

export type FileAttachment = {
  fileId: number;
  fileName: string;
  storedFileName: string;
  downloadURL: string;
  size: number;
  mimeType: string;
};

export type ChatMessage = {
  messageId: number;
  scope: "public" | "private" | "group";
  sender: CurrentUser;
  receiverUsername?: string;
  groupID?: number;
  contentType: "text" | "file";
  content: string;
  file?: FileAttachment;
  timestamp: string;
};

export type Group = {
  groupID: number;
  groupName: string;
  creator: CurrentUser;
  memberCount: number;
  createdAt: string;
};

export type GroupMember = {
  user: CurrentUser;
  role: number;
  joinedAt: string;
};

export type GroupSendPayload = {
  groupID: number;
  content: string;
};

export type CreateGroupRequest = {
  groupName: string;
  members?: string[];
};

export type CreateGroupResponse = {
  group: Group;
};

export type AddGroupMemberRequest = {
  usernames: string[];
};

export type UploadResponse = {
  file: FileAttachment;
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

export type SessionReadyPayload = {
  user: CurrentUser;
  heartbeatTimeout: string;
};

export type PresencePayload = {
  user: OnlineUser;
};

export type PublicSendPayload = {
  content: string;
};

export type PrivateSendPayload = {
  receiverUsername: string;
  content: string;
};
