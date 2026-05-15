// Package repository contains database access layers.
package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PublicMessage is the row shape needed by the public history endpoint.
type PublicMessage struct {
	MessageID   int64
	SenderID    int64
	Content     string
	MessageType int16 // 0=text, 1=file (matches the migration comment)
	CreatedAt   time.Time
	Username    string
	Nickname    string
	File        MessageFile
}

// MessageInsert captures DB-generated fields needed after inserting a message.
type MessageInsert struct {
	MessageID int64
	CreatedAt time.Time
}

// PrivateMessage is the row shape for a two-user private conversation.
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
	File             MessageFile
}

// MessageFile is the optional file metadata joined from files for message history.
type MessageFile struct {
	FileID         sql.NullInt64
	FileName       sql.NullString
	StoredFileName sql.NullString
	FileSize       sql.NullInt64
	MIMEType       sql.NullString
}

// MessageRepository wraps the unified messages table.
type MessageRepository struct {
	pool *pgxpool.Pool
}

// NewMessageRepository creates a message repository.
func NewMessageRepository(pool *pgxpool.Pool) *MessageRepository {
	return &MessageRepository{pool: pool}
}

// GetPublicHistory returns public messages in message_id DESC order.
// The service layer reverses the rows before returning them to clients.
func (r *MessageRepository) GetPublicHistory(ctx context.Context, beforeID int64, limit int) ([]PublicMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
		       u.username, u.nickname,
		       f.file_id, f.file_name, f.stored_file_name, f.file_size, f.file_type
		FROM messages m
		JOIN users u ON u.user_id = m.sender_id
		LEFT JOIN files f ON f.message_id = m.message_id
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
			&m.File.FileID, &m.File.FileName, &m.File.StoredFileName, &m.File.FileSize, &m.File.MIMEType,
		); err != nil {
			return nil, fmt.Errorf("GetPublicHistory scan: %w", err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// GetPrivateHistory returns messages between two users in message_id DESC order.
func (r *MessageRepository) GetPrivateHistory(ctx context.Context, userID1, userID2, beforeID int64, limit int) ([]PrivateMessage, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.message_type, m.created_at,
		       s.username, s.nickname,
		       recv.username, recv.nickname,
		       f.file_id, f.file_name, f.stored_file_name, f.file_size, f.file_type
		FROM messages m
		JOIN users s    ON s.user_id    = m.sender_id
		JOIN users recv ON recv.user_id = m.receiver_id
		LEFT JOIN files f ON f.message_id = m.message_id
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
			&m.File.FileID, &m.File.FileName, &m.File.StoredFileName, &m.File.FileSize, &m.File.MIMEType,
		); err != nil {
			return nil, fmt.Errorf("GetPrivateHistory scan: %w", err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// InsertPublicMessage inserts a lobby message. messageType: 0=text, 1=file.
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

// InsertPrivateMessage inserts a direct message between two users.
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
