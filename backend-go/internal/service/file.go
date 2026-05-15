package service

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
	"github.com/elaine/chatter2/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

var (
	ErrFileRequired  = errors.New("file is required")
	ErrFileTooLarge  = errors.New("file is too large")
	ErrForbiddenFile = errors.New("forbidden file access")
)

type FileUploadInput struct {
	SenderID         int64
	SenderUsername   string
	SenderNickname   string
	ReceiverUsername string
	FileName         string
	MIMEType         string
	Size             int64
	Reader           io.Reader
}

type FileDownload struct {
	FileID         int64
	FileName       string
	StoredFileName string
	Size           int64
	MIMEType       string
	Path           string
}

type FileUploadResult struct {
	ReceiverUsername string
	Message          *protocolv2.Message
	File             protocolv2.FileAttachment
}

// fileRecord holds the result of a transactional file message insert.
type fileRecord struct {
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

type FileService struct {
	pool        *pgxpool.Pool
	queries     *sqlcgen.Queries
	sessions    *session.Manager
	uploadDir   string
	maxFileSize int64
}

func NewFileService(
	pool *pgxpool.Pool,
	queries *sqlcgen.Queries,
	sessions *session.Manager,
	uploadDir string,
	maxFileSize int64,
) *FileService {
	return &FileService{
		pool:        pool,
		queries:     queries,
		sessions:    sessions,
		uploadDir:   uploadDir,
		maxFileSize: maxFileSize,
	}
}

func (s *FileService) SaveUpload(ctx context.Context, in FileUploadInput) (*FileUploadResult, error) {
	fileName := strings.TrimSpace(filepath.Base(in.FileName))
	if fileName == "" || in.Reader == nil {
		return nil, ErrFileRequired
	}
	if in.Size > s.maxFileSize {
		return nil, ErrFileTooLarge
	}

	if err := os.MkdirAll(s.uploadDir, 0o755); err != nil {
		return nil, fmt.Errorf("create upload dir: %w", err)
	}

	storedFileName := generateStoredFileName(fileName)
	finalPath := filepath.Join(s.uploadDir, storedFileName)
	tmpPath := finalPath + ".tmp"

	dst, err := os.Create(tmpPath)
	if err != nil {
		return nil, fmt.Errorf("create upload file: %w", err)
	}

	hasher := md5.New()
	written, copyErr := io.Copy(io.MultiWriter(dst, hasher), io.LimitReader(in.Reader, s.maxFileSize+1))
	closeErr := dst.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("write upload file: %w", copyErr)
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("close upload file: %w", closeErr)
	}
	if written > s.maxFileSize {
		_ = os.Remove(tmpPath)
		return nil, ErrFileTooLarge
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return nil, fmt.Errorf("finalize upload file: %w", err)
	}

	fileURL := "/uploads/" + url.PathEscape(storedFileName)
	md5Hex := hex.EncodeToString(hasher.Sum(nil))
	mimeType := strings.TrimSpace(in.MIMEType)
	if mimeType == "" {
		mimeType = mime.TypeByExtension(filepath.Ext(fileName))
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	record, receiverUsername, err := s.createFileMessage(ctx, in, fileName, storedFileName, fileURL, mimeType, written, md5Hex)
	if err != nil {
		_ = os.Remove(finalPath)
		return nil, err
	}

	fileAttachment := protocolv2.FileAttachment{
		FileID:         record.FileID,
		FileName:       record.FileName,
		StoredFileName: record.StoredFileName,
		DownloadURL:    fmt.Sprintf("/api/v2/files/%d", record.FileID),
		Size:           record.Size,
		MIMEType:       record.MIMEType,
	}

	message := &protocolv2.Message{
		MessageID: record.MessageID,
		Scope:     messageScope(receiverUsername),
		Sender: protocolv2.User{
			UserID:   in.SenderID,
			Username: in.SenderUsername,
			Nickname: in.SenderNickname,
			Online:   s.sessions.IsOnline(in.SenderUsername),
		},
		ReceiverUsername: receiverUsername,
		ContentType:      "file",
		Content:          fileName,
		File:             &fileAttachment,
		Timestamp:        record.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}

	return &FileUploadResult{
		ReceiverUsername: receiverUsername,
		Message:          message,
		File:             fileAttachment,
	}, nil
}

func (s *FileService) GetDownload(ctx context.Context, requesterUserID int64, fileID int64) (*FileDownload, error) {
	record, err := s.queries.GetFileByID(ctx, fileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, repository.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get file: %w", err)
	}

	if record.ReceiverID != nil && requesterUserID != record.SenderID && requesterUserID != *record.ReceiverID {
		return nil, ErrForbiddenFile
	}

	return &FileDownload{
		FileID:         record.FileID,
		FileName:       record.FileName,
		StoredFileName: record.StoredFileName,
		Size:           record.FileSize,
		MIMEType:       optionalString(record.FileType),
		Path:           filepath.Join(s.uploadDir, record.StoredFileName),
	}, nil
}

func (s *FileService) createFileMessage(ctx context.Context, in FileUploadInput, fileName, storedFileName, fileURL, mimeType string, written int64, md5Hex string) (*fileRecord, string, error) {
	content := fileName
	receiverUsername := strings.TrimSpace(in.ReceiverUsername)

	if receiverUsername == "" {
		tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
		if err != nil {
			return nil, "", fmt.Errorf("begin tx: %w", err)
		}
		defer func() {
			if err != nil {
				_ = tx.Rollback(ctx)
			}
		}()

		q := s.queries.WithTx(tx)

		msgRow, insErr := q.InsertPublicMessage(ctx, sqlcgen.InsertPublicMessageParams{
			SenderID:    in.SenderID,
			MessageType: 1,
			Content:     content,
		})
		if insErr != nil {
			err = insErr
			return nil, "", fmt.Errorf("insert public file message: %w", insErr)
		}

		fileID, insErr := q.InsertFile(ctx, sqlcgen.InsertFileParams{
			MessageID:      msgRow.MessageID,
			FileName:       fileName,
			StoredFileName: storedFileName,
			FileUrl:        fileURL,
			FileSize:       written,
			FileType:       &mimeType,
			Md5:            &md5Hex,
		})
		if insErr != nil {
			err = insErr
			return nil, "", fmt.Errorf("insert file: %w", insErr)
		}

		if commitErr := tx.Commit(ctx); commitErr != nil {
			err = commitErr
			return nil, "", fmt.Errorf("commit file tx: %w", commitErr)
		}

		return &fileRecord{
			FileID:         fileID,
			MessageID:      msgRow.MessageID,
			SenderID:       in.SenderID,
			FileName:       fileName,
			StoredFileName: storedFileName,
			FileURL:        fileURL,
			Size:           written,
			MIMEType:       mimeType,
			MD5:            md5Hex,
			CreatedAt:      msgRow.CreatedAt.Time,
		}, "", nil
	}

	if receiverUsername == in.SenderUsername {
		return nil, "", ErrCannotMessageSelf
	}
	receiver, lookupErr := s.queries.GetUserByUsername(ctx, receiverUsername)
	if lookupErr != nil {
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return nil, "", repository.ErrNotFound
		}
		return nil, "", lookupErr
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	q := s.queries.WithTx(tx)

	msgRow, insErr := q.InsertPrivateMessage(ctx, sqlcgen.InsertPrivateMessageParams{
		SenderID:    in.SenderID,
		ReceiverID:  &receiver.UserID,
		MessageType: 1,
		Content:     content,
	})
	if insErr != nil {
		err = insErr
		return nil, "", fmt.Errorf("insert private file message: %w", insErr)
	}

	fileID, insErr := q.InsertFile(ctx, sqlcgen.InsertFileParams{
		MessageID:      msgRow.MessageID,
		FileName:       fileName,
		StoredFileName: storedFileName,
		FileUrl:        fileURL,
		FileSize:       written,
		FileType:       &mimeType,
		Md5:            &md5Hex,
	})
	if insErr != nil {
		err = insErr
		return nil, "", fmt.Errorf("insert file: %w", insErr)
	}

	if commitErr := tx.Commit(ctx); commitErr != nil {
		err = commitErr
		return nil, "", fmt.Errorf("commit file tx: %w", commitErr)
	}

	return &fileRecord{
		FileID:         fileID,
		MessageID:      msgRow.MessageID,
		SenderID:       in.SenderID,
		ReceiverID:     &receiver.UserID,
		FileName:       fileName,
		StoredFileName: storedFileName,
		FileURL:        fileURL,
		Size:           written,
		MIMEType:       mimeType,
		MD5:            md5Hex,
		CreatedAt:      msgRow.CreatedAt.Time,
	}, receiver.Username, nil
}

func generateStoredFileName(fileName string) string {
	now := time.Now().UTC().Format("20060102150405.000000000")
	now = strings.ReplaceAll(now, ".", "")
	ext := filepath.Ext(fileName)
	base := strings.TrimSuffix(fileName, ext)
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r + ('a' - 'A')
		case r >= '0' && r <= '9':
			return r
		case r == '-' || r == '_':
			return r
		default:
			return '-'
		}
	}, base)
	base = strings.Trim(base, "-")
	if base == "" {
		base = "file"
	}
	return fmt.Sprintf("%s-%s%s", now, base, ext)
}

func messageScope(receiverUsername string) string {
	if receiverUsername == "" {
		return "public"
	}
	return "private"
}
