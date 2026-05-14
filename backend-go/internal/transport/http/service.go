// service.go — 消息相关业务逻辑层，位于 HTTP handler 和数据库查询层之间。
//
// 这一层的职责：
//   - 把数据库原始行组装成 protocol-v2 的资源结构
//   - 隔离 handler 与数据库的直接依赖
//
// 注意：用户认证相关 service 已经迁回 internal/service。
// 当前文件只保留消息侧逻辑，因为 message repository 仍在 storage 包中，
// 这样可以避免把一套错误 schema 的实验代码误接入主路径。
package http

import (
	"context"
	"fmt"
	"strconv"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/session"
	"github.com/elaine/chatter2/backend-go/internal/storage"
)

// --- MessageService ---

// MessageService 把数据库原始行组装成 protocol-v2 的 Message 结构。
// 它还需要 session.Manager 来填充 Online 字段（在线状态在内存中维护）。
type MessageService struct {
	messages *storage.MessageRepository
	sessions *session.Manager
}

func newMessageService(messages *storage.MessageRepository, sessions *session.Manager) *MessageService {
	return &MessageService{messages: messages, sessions: sessions}
}

// GetPublicHistory 返回按时间顺序排列的大厅消息分页。
//   - cursorStr：上一页返回的游标，空字符串表示从最新开始
//   - limit：每页条数，自动限制在 1~100 之间
func (s *MessageService) GetPublicHistory(ctx context.Context, cursorStr string, limit int) ([]protocolv2.Message, string, error) {
	// 历史接口与实时事件故意不复用同一个流程：
	// - 历史接口要解决分页、顺序翻转、首屏恢复
	// - 实时事件要解决在线投递、增量追加
	//
	// 这两者最终可以共享 Message 结构，但不应该强行共享一条执行路径。
	limit = clampLimit(limit)
	beforeID, err := parseCursor(cursorStr)
	if err != nil {
		return nil, "", fmt.Errorf("invalid cursor: %w", err)
	}

	rows, err := s.messages.GetPublicHistory(ctx, beforeID, limit)
	if err != nil {
		return nil, "", err
	}

	// 查询结果是 DESC（最新在前），翻转后变为时间正序供前端展示。
	msgs := make([]protocolv2.Message, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		r := rows[i]
		msgs = append(msgs, protocolv2.Message{
			MessageID: r.MessageID,
			Scope:     "public",
			Sender: protocolv2.User{
				UserID:   r.SenderID,
				Username: r.Username,
				Nickname: r.Nickname,
				Online:   s.sessions.IsOnline(r.Username),
			},
			ContentType: msgTypeToString(r.MessageType),
			Content:     r.Content,
			Timestamp:   r.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}

	// 如果恰好取满一页，说明可能还有更旧的数据，把最旧那条的 ID 编码为游标。
	var nextCursor string
	if len(rows) == limit {
		nextCursor = strconv.FormatInt(rows[len(rows)-1].MessageID, 10)
	}
	return msgs, nextCursor, nil
}

// GetPrivateHistoryByIDs 返回两个用户之间的私聊消息分页。
//   - userID1：发起请求的用户（已登录）
//   - userID2：对方用户 ID
//   - beforeID：游标，0 表示从最新开始
func (s *MessageService) GetPrivateHistoryByIDs(ctx context.Context, userID1, userID2, beforeID int64, limit int) ([]protocolv2.Message, string, error) {
	limit = clampLimit(limit)

	rows, err := s.messages.GetPrivateHistory(ctx, userID1, userID2, beforeID, limit)
	if err != nil {
		return nil, "", err
	}

	msgs := make([]protocolv2.Message, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		r := rows[i]
		msgs = append(msgs, protocolv2.Message{
			MessageID: r.MessageID,
			Scope:     "private",
			Sender: protocolv2.User{
				UserID:   r.SenderID,
				Username: r.SenderUsername,
				Nickname: r.SenderNickname,
				Online:   s.sessions.IsOnline(r.SenderUsername),
			},
			ReceiverUsername: r.ReceiverUsername,
			ContentType:      msgTypeToString(r.MessageType),
			Content:          r.Content,
			Timestamp:        r.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}

	var nextCursor string
	if len(rows) == limit {
		nextCursor = strconv.FormatInt(rows[len(rows)-1].MessageID, 10)
	}
	return msgs, nextCursor, nil
}

// parseCursor 把游标字符串解码为 message_id 整数。空字符串返回 0（从最新开始）。
func parseCursor(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	return strconv.ParseInt(s, 10, 64)
}

// clampLimit 把 limit 限制在合理范围内。
func clampLimit(n int) int {
	if n <= 0 || n > 100 {
		return 50
	}
	return n
}

// msgTypeToString 把数据库整数类型映射为协议字符串。
// 0=text, 1=file（与 001_initial.sql 注释对齐）。
func msgTypeToString(t int16) string {
	if t == 1 {
		return "file"
	}
	return "text"
}
