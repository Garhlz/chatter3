package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// FileRecord is the DB view needed for API responses and download permission checks.
type FileRecord struct {
	FileID         int64
	MessageID      int64
	SenderID       int64
	ReceiverID     *int64
	FileName       string
	StoredFileName string
	FileURL        string
	Size           int64
	MIMEType       string
	MD5            string
	CreatedAt      time.Time
}

// FileRepository owns files table access and the message+file insert transaction.
type FileRepository struct {
	pool *pgxpool.Pool
}

func NewFileRepository(pool *pgxpool.Pool) *FileRepository {
	return &FileRepository{pool: pool}
}

func (r *FileRepository) CreatePublicFileMessage(ctx context.Context, senderID int64, content, fileName, storedFileName, fileURL string, size int64, mimeType, md5 string) (*FileRecord, error) {
	return r.createFileMessage(ctx, senderID, nil, content, fileName, storedFileName, fileURL, size, mimeType, md5)
}

func (r *FileRepository) CreatePrivateFileMessage(ctx context.Context, senderID, receiverID int64, content, fileName, storedFileName, fileURL string, size int64, mimeType, md5 string) (*FileRecord, error) {
	return r.createFileMessage(ctx, senderID, &receiverID, content, fileName, storedFileName, fileURL, size, mimeType, md5)
}

func (r *FileRepository) createFileMessage(ctx context.Context, senderID int64, receiverID *int64, content, fileName, storedFileName, fileURL string, size int64, mimeType, md5 string) (*FileRecord, error) {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, fmt.Errorf("begin file message tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	var (
		messageID int64
		createdAt time.Time
	)

	if receiverID == nil {
		err = tx.QueryRow(ctx,
			`INSERT INTO messages (sender_id, message_type, content) VALUES ($1, $2, $3) RETURNING message_id, created_at`,
			senderID, 1, content,
		).Scan(&messageID, &createdAt)
	} else {
		err = tx.QueryRow(ctx,
			`INSERT INTO messages (sender_id, receiver_id, message_type, content) VALUES ($1, $2, $3, $4) RETURNING message_id, created_at`,
			senderID, *receiverID, 1, content,
		).Scan(&messageID, &createdAt)
	}
	if err != nil {
		return nil, fmt.Errorf("insert file message: %w", err)
	}

	record := &FileRecord{
		MessageID:      messageID,
		SenderID:       senderID,
		ReceiverID:     receiverID,
		FileName:       fileName,
		StoredFileName: storedFileName,
		FileURL:        fileURL,
		Size:           size,
		MIMEType:       mimeType,
		MD5:            md5,
		CreatedAt:      createdAt,
	}

	err = tx.QueryRow(ctx,
		`INSERT INTO files (message_id, file_name, stored_file_name, file_url, file_size, file_type, md5)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING file_id`,
		messageID, fileName, storedFileName, fileURL, size, mimeType, md5,
	).Scan(&record.FileID)
	if err != nil {
		return nil, fmt.Errorf("insert file row: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit file message tx: %w", err)
	}
	return record, nil
}

func (r *FileRepository) GetByID(ctx context.Context, fileID int64) (*FileRecord, error) {
	query := `
		SELECT f.file_id, f.message_id, m.sender_id, m.receiver_id,
		       f.file_name, f.stored_file_name, f.file_url, f.file_size, f.file_type, COALESCE(f.md5, ''), m.created_at
		FROM files f
		JOIN messages m ON m.message_id = f.message_id
		WHERE f.file_id = $1
	`

	var (
		record     FileRecord
		receiverID *int64
	)
	err := r.pool.QueryRow(ctx, query, fileID).Scan(
		&record.FileID,
		&record.MessageID,
		&record.SenderID,
		&receiverID,
		&record.FileName,
		&record.StoredFileName,
		&record.FileURL,
		&record.Size,
		&record.MIMEType,
		&record.MD5,
		&record.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("GetByID file: %w", err)
	}
	record.ReceiverID = receiverID
	return &record, nil
}
