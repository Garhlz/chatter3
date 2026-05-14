// message_repo.go — 消息相关的数据库查询。
//
// 历史消息采用基于 message_id 的游标分页：
//   - beforeID=0 表示从最新一条开始
//   - beforeID=N 表示取 message_id < N 的记录（即更旧的记录）
//
// 查询结果按 message_id DESC 返回（最新在前），
// 调用方（service 层）负责翻转顺序以供前端按时间顺序展示。
package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PublicMessage 是大厅（公开）消息的查询结果行。
type PublicMessage struct {
	MessageID   int64
	SenderID    int64
	Content     string
	MessageType int16 // 0=text, 1=file（与数据库 migration 注释对齐）
	CreatedAt   time.Time
	Username    string
	Nickname    string
}

// MessageInsert captures the minimal DB-generated fields needed after inserting a message.
type MessageInsert struct {
	MessageID int64
	CreatedAt time.Time
}

// PrivateMessage 是私聊消息的查询结果行，包含收发双方的用户信息。
type PrivateMessage struct {
	MessageID        int64
	SenderID         int64
	ReceiverID       int64
	Content          string
	MessageType      int16
	CreatedAt        time.Time
	SenderUsername   string
	SenderNickname   string
	ReceiverUsername string
	ReceiverNickname string
}

// MessageRepository 封装 messages 表的查询。
type MessageRepository struct {
	pool *pgxpool.Pool
}

// NewMessageRepository 创建 MessageRepository。
func NewMessageRepository(pool *pgxpool.Pool) *MessageRepository {
	return &MessageRepository{pool: pool}
}

// GetPublicHistory 返回大厅消息，按 message_id DESC 排序（最新在前）。
//   - beforeID=0：从最新消息开始
//   - beforeID=N：取 message_id < N 的消息（翻页时使用）
//   - limit：最多返回多少条
func (r *MessageRepository) GetPublicHistory(ctx context.Context, beforeID int64, limit int) ([]PublicMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
		       u.username, u.nickname
		FROM messages m
		JOIN users u ON u.user_id = m.sender_id
		WHERE m.receiver_id IS NULL
		  AND m.group_id IS NULL
		  AND ($1::bigint = 0 OR m.message_id < $1)
		ORDER BY m.message_id DESC
		LIMIT $2`,
		beforeID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetPublicHistory query: %w", err)
	}
	defer rows.Close()

	var msgs []PublicMessage
	for rows.Next() {
		var m PublicMessage
		if err := rows.Scan(
			&m.MessageID, &m.SenderID, &m.Content, &m.MessageType, &m.CreatedAt,
			&m.Username, &m.Nickname,
		); err != nil {
			return nil, fmt.Errorf("GetPublicHistory scan: %w", err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// GetPrivateHistory 返回两个用户之间的私聊消息，双向匹配（A→B 和 B→A 都包含）。
//   - userID1, userID2：两个用户的 ID（顺序无关）
//   - beforeID：游标，0 表示从最新开始
//   - limit：最多返回多少条
func (r *MessageRepository) GetPrivateHistory(ctx context.Context, userID1, userID2, beforeID int64, limit int) ([]PrivateMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.message_type, m.created_at,
		       s.username, s.nickname,
		       recv.username, recv.nickname
		FROM messages m
		JOIN users s    ON s.user_id    = m.sender_id
		JOIN users recv ON recv.user_id = m.receiver_id
		WHERE m.receiver_id IS NOT NULL
		  AND (
		    (m.sender_id = $1 AND m.receiver_id = $2)
		    OR (m.sender_id = $2 AND m.receiver_id = $1)
		  )
		  AND ($3::bigint = 0 OR m.message_id < $3)
		ORDER BY m.message_id DESC
		LIMIT $4`,
		userID1, userID2, beforeID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetPrivateHistory query: %w", err)
	}
	defer rows.Close()

	var msgs []PrivateMessage
	for rows.Next() {
		var m PrivateMessage
		if err := rows.Scan(
			&m.MessageID, &m.SenderID, &m.ReceiverID, &m.Content, &m.MessageType, &m.CreatedAt,
			&m.SenderUsername, &m.SenderNickname,
			&m.ReceiverUsername, &m.ReceiverNickname,
		); err != nil {
			return nil, fmt.Errorf("GetPrivateHistory scan: %w", err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// InsertPublicMessage 插入大厅消息，messageType: 0=text, 1=file。
// 大厅消息的 scope 由 receiver_id=NULL AND group_id=NULL 隐含。
func (r *MessageRepository) InsertPublicMessage(ctx context.Context, senderID int64, messageType int16, content string) (*MessageInsert, error) {
	var row MessageInsert
	if err := r.pool.QueryRow(ctx,
		`INSERT INTO messages (sender_id, message_type, content) VALUES ($1, $2, $3) RETURNING message_id, created_at`,
		senderID, messageType, content,
	).Scan(&row.MessageID, &row.CreatedAt); err != nil {
		return nil, fmt.Errorf("InsertPublicMessage: %w", err)
	}
	return &row, nil
}

// InsertPrivateMessage 插入私聊消息。
func (r *MessageRepository) InsertPrivateMessage(ctx context.Context, senderID, receiverID int64, messageType int16, content string) (*MessageInsert, error) {
	var row MessageInsert
	if err := r.pool.QueryRow(ctx,
		`INSERT INTO messages (sender_id, receiver_id, message_type, content) VALUES ($1, $2, $3, $4) RETURNING message_id, created_at`,
		senderID, receiverID, messageType, content,
	).Scan(&row.MessageID, &row.CreatedAt); err != nil {
		return nil, fmt.Errorf("InsertPrivateMessage: %w", err)
	}
	return &row, nil
}
