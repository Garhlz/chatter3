// Package v2 定义新 Tauri 客户端使用的 HTTP/WS 协议结构。
package v2

// ErrorBody 是所有失败响应和错误事件的统一结构。
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// APIErrorResponse 是 HTTP 失败响应结构。
type APIErrorResponse struct {
	Error ErrorBody `json:"error"`
}

// APIResponse 是 HTTP 成功响应结构。
type APIResponse[T any] struct {
	Data T `json:"data"`
}

// CursorResponse 是带游标的列表响应。
type CursorResponse[T any] struct {
	Data       []T    `json:"data"`
	NextCursor string `json:"nextCursor,omitempty"`
}

// User 是 v2 协议中的用户公开结构。
type User struct {
	UserID    int64  `json:"userId"`
	Username  string `json:"username"`
	Nickname  string `json:"nickname"`
	AvatarURL string `json:"avatarUrl,omitempty"`
	Online    bool   `json:"online"`
}

// UserProfile is the user's profile visible to other users.
type UserProfile struct {
	User          User   `json:"user"`
	BackgroundURL string `json:"backgroundUrl,omitempty"`
	Bio           string `json:"bio"`
	Gender        int16  `json:"gender"`
	CreatedAt     string `json:"createdAt"`
}

// OwnProfile adds private fields visible only to the profile owner.
type OwnProfile struct {
	UserProfile
	Email string `json:"email,omitempty"`
}

// UpdateProfileRequest is the body for PUT /api/v2/users/{username}/profile.
type UpdateProfileRequest struct {
	Nickname *string `json:"nickname,omitempty"`
	Bio      *string `json:"bio,omitempty"`
	Email    *string `json:"email,omitempty"`
	Gender   *int16  `json:"gender,omitempty"`
}

// FileAttachment 是消息中的文件元数据结构。
type FileAttachment struct {
	FileID         int64  `json:"fileId"`
	FileName       string `json:"fileName"`
	StoredFileName string `json:"storedFileName"`
	DownloadURL    string `json:"downloadURL"`
	Size           int64  `json:"size"`
	MIMEType       string `json:"mimeType"`
}

// Message 是历史接口与实时事件共用的消息结构。
type Message struct {
	MessageID        int64           `json:"messageId"`
	Scope            string          `json:"scope"`
	Sender           User            `json:"sender"`
	ReceiverUsername string          `json:"receiverUsername,omitempty"`
	GroupID          int64           `json:"groupID,omitempty"`
	ContentType      string          `json:"contentType"`
	Content          string          `json:"content"`
	File             *FileAttachment `json:"file,omitempty"`
	Timestamp        string          `json:"timestamp"`
}

type RegisterRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Nickname string `json:"nickname"`
}

type RegisterResponse struct {
	User User `json:"user"`
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type UploadResponse struct {
	File FileAttachment `json:"file"`
}

// ProfileChangedPayload 只包含公开资料，可安全广播给其他在线用户。
// email 属于本人私有字段，因此不会出现在 realtime 事件中。
type ProfileChangedPayload struct {
	Profile UserProfile `json:"profile"`
}

// Event 是所有 WebSocket 消息的统一外层。
type Event[T any] struct {
	Event     string `json:"event"`
	RequestID string `json:"requestId,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
	Payload   T      `json:"payload"`
}

type PingPayload struct{}

type ReadyPayload struct {
	User             User   `json:"user"`
	HeartbeatTimeout string `json:"heartbeatTimeout"`
}

type PongPayload struct{}

type PublicSendPayload struct {
	Content string `json:"content"`
}

type PrivateSendPayload struct {
	ReceiverUsername string `json:"receiverUsername"`
	Content          string `json:"content"`
}

type PresencePayload struct {
	User User `json:"user"`
}

type ErrorPayload = ErrorBody

// Group is the protocol representation of a chat group.
type Group struct {
	GroupID     int64  `json:"groupID"`
	GroupName   string `json:"groupName"`
	Creator     User   `json:"creator"`
	MemberCount int    `json:"memberCount"`
	CreatedAt   string `json:"createdAt"`
}

// GroupChangedPayload notifies connected clients that group navigation data changed.
//
// Text messages still use chat.group.message. This event only asks the UI to update
// group metadata or remove a conversation when the current user was removed.
type GroupChangedPayload struct {
	Group           Group  `json:"group"`
	RemovedUsername string `json:"removedUsername,omitempty"`
}

// GroupMember is a user with their role within a group.
type GroupMember struct {
	User     User   `json:"user"`
	Role     int16  `json:"role"`
	JoinedAt string `json:"joinedAt"`
}

// GroupSendPayload is the WebSocket payload for sending a group message.
type GroupSendPayload struct {
	GroupID int64  `json:"groupID"`
	Content string `json:"content"`
}

// CreateGroupRequest is the HTTP body for creating a group.
type CreateGroupRequest struct {
	GroupName string   `json:"groupName"`
	Members   []string `json:"members,omitempty"`
}

// CreateGroupResponse wraps the created group.
type CreateGroupResponse struct {
	Group Group `json:"group"`
}

// AddGroupMemberRequest is the HTTP body for adding members.
type AddGroupMemberRequest struct {
	Usernames []string `json:"usernames"`
}
