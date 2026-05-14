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
	UserID   int64  `json:"userId"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	Online   bool   `json:"online"`
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
