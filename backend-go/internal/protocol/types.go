// Package protocol 定义客户端与服务端之间的消息结构。
// 对应协议文档 docs/protocol-v1.md。
package protocol

// MsgType 是消息类型枚举。
type MsgType string

const (
	TypeLogin          MsgType = "LOGIN"
	TypeRegister       MsgType = "REGISTER"
	TypeChat           MsgType = "CHAT"
	TypePrivateChat    MsgType = "PRIVATE_CHAT"
	TypeGroupChat      MsgType = "GROUP_CHAT"
	TypeSystem         MsgType = "SYSTEM"
	TypeError          MsgType = "ERROR"
	TypeHeartbeat      MsgType = "HEARTBEAT"
	TypeLogout         MsgType = "LOGOUT"
	TypeOnlineUsers    MsgType = "ONLINE_USERS"
	TypeOfflineUsers   MsgType = "OFFLINE_USERS"
	TypeHistoryMsg     MsgType = "HISTORY_MESSAGES"
	TypeUserLogin      MsgType = "USER_LOGIN"
	TypeUserLogout     MsgType = "USER_LOGOUT"
	TypeFile           MsgType = "FILE"
	TypeGroupCreate    MsgType = "GROUP_CREATE"
	TypeGroupDelete    MsgType = "GROUP_DELETE"
	TypeGroupAdd       MsgType = "GROUP_ADD"
	TypeGroupRemove    MsgType = "GROUP_REMOVE"
	TypeGroupResponse  MsgType = "GROUP_RESPONSE"
	TypeGroupInfo      MsgType = "GROUP_INFO"
	TypeGroupBroadcast MsgType = "GROUP_BROADCAST"
)

// Envelope 是所有消息共用的外层结构，与 Java MessageDTO 对应。
// 部分字段只在特定消息类型中使用，其余为 nil/零值。
// Content 使用 any 以兼容字符串、对象、数组等多种载荷。
type Envelope struct {
	Type         MsgType `json:"type"`
	UserID       *int64  `json:"userId,omitempty"`
	Username     string  `json:"username,omitempty"`
	Password     string  `json:"password,omitempty"`
	Nickname     string  `json:"nickname,omitempty"`
	Receiver     string  `json:"receiver,omitempty"`
	GroupID      *int64  `json:"groupId,omitempty"`
	Content      any     `json:"content,omitempty"`
	Token        string  `json:"token,omitempty"`
	Status       string  `json:"status,omitempty"`
	Timestamp    string  `json:"timestamp,omitempty"`
	ErrorMessage string  `json:"errorMessage,omitempty"`
	MessageID    *int64  `json:"messageId,omitempty"`
}

// GroupOpContent 是 GROUP_CREATE/DELETE/ADD/REMOVE 消息的 content 字段结构。
type GroupOpContent struct {
	OperationID string `json:"operationId"`
	OperatorID  int64  `json:"operatorId"`
	GroupID     int64  `json:"groupId"`
	UserID      int64  `json:"userId"`
	GroupName   string `json:"groupName"`
}

// UserInfo 用于 ONLINE_USERS / OFFLINE_USERS / USER_LOGIN / USER_LOGOUT 中的用户列表元素。
// 时间字段统一使用 ISO 字符串（相比 Java 原版的数组格式是修正行为）。
type UserInfo struct {
	UserID        int64  `json:"userId"`
	Username      string `json:"username"`
	Nickname      string `json:"nickname"`
	AvatarURL     string `json:"avatarUrl"`
	Status        int    `json:"status"`
	Online        bool   `json:"online"`
	LastHeartbeat string `json:"lastHeartbeat,omitempty"`
	CreatedAt     string `json:"createdAt,omitempty"`
	LastLoginAt   string `json:"lastLoginAt,omitempty"`
}

// GroupDetail 用于 GROUP_INFO content 数组的元素。
type GroupDetail struct {
	GroupID   int64      `json:"groupId"`
	GroupName string     `json:"groupName"`
	CreatorID int64      `json:"creatorId"`
	CreatedAt string     `json:"createdAt,omitempty"`
	Members   []UserInfo `json:"members"`
}

// FileInfo 用于实时 FILE 消息的 content 字段（对象格式）。
type FileInfo struct {
	FileID         int64  `json:"fileId"`
	MessageID      int64  `json:"messageId"`
	FileName       string `json:"fileName"`
	StoredFileName string `json:"storedFileName"`
	FileURL        string `json:"fileUrl"`
	FileSize       int64  `json:"fileSize"`
	FileType       string `json:"fileType"`
	MD5            string `json:"md5"`
	UploadTime     string `json:"uploadTime"`
}
