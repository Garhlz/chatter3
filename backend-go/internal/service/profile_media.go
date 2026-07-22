package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter3/backend-go/internal/session"
)

const MaxProfileImageSize int64 = 5 * 1024 * 1024

var (
	ErrInvalidProfileImage     = errors.New("profile image must be a JPEG or PNG")
	ErrProfileImageTooLarge    = errors.New("profile image is too large")
	ErrInvalidProfileImageKind = errors.New("invalid profile image kind")
)

type ProfileImageInput struct {
	UserID int64
	Kind   string
	Reader io.Reader
}

// ProfileMediaService 只负责资料图片的文件生命周期和 URL 持久化。
// 聊天文件会创建 message/files 记录，而资料图片不会成为聊天消息，因此两者
// 不能直接共用 FileService.SaveUpload 的业务流程。
type ProfileMediaService struct {
	queries  *sqlcgen.Queries
	sessions *session.Manager
	mediaDir string
}

func NewProfileMediaService(queries *sqlcgen.Queries, sessions *session.Manager, uploadDir string) *ProfileMediaService {
	return &ProfileMediaService{
		queries:  queries,
		sessions: sessions,
		mediaDir: filepath.Join(uploadDir, "profile-media"),
	}
}

func (s *ProfileMediaService) Save(ctx context.Context, in ProfileImageInput) (string, error) {
	if in.Kind != "avatar" && in.Kind != "background" {
		return "", ErrInvalidProfileImageKind
	}
	if in.Reader == nil {
		return "", ErrInvalidProfileImage
	}

	data, err := io.ReadAll(io.LimitReader(in.Reader, MaxProfileImageSize+1))
	if err != nil {
		return "", fmt.Errorf("read profile image: %w", err)
	}
	if int64(len(data)) > MaxProfileImageSize {
		return "", ErrProfileImageTooLarge
	}
	_, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (format != "jpeg" && format != "png") {
		return "", ErrInvalidProfileImage
	}

	row, err := s.queries.GetUserByID(ctx, in.UserID)
	if err != nil {
		return "", fmt.Errorf("get profile image owner: %w", err)
	}
	oldURL := row.BackgroundUrl
	if in.Kind == "avatar" {
		oldURL = row.AvatarUrl
	}

	if err := os.MkdirAll(s.mediaDir, 0o755); err != nil {
		return "", fmt.Errorf("create profile media directory: %w", err)
	}
	extension := ".png"
	if format == "jpeg" {
		extension = ".jpg"
	}
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate profile image name: %w", err)
	}
	storedName := fmt.Sprintf("%d-%s-%s%s", in.UserID, in.Kind, hex.EncodeToString(randomBytes), extension)
	finalPath := filepath.Join(s.mediaDir, storedName)
	tmpPath := finalPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return "", fmt.Errorf("write profile image: %w", err)
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("finalize profile image: %w", err)
	}

	mediaURL := "/api/v2/profile-media/" + storedName
	if in.Kind == "avatar" {
		err = s.queries.UpdateUserAvatarURL(ctx, sqlcgen.UpdateUserAvatarURLParams{UserID: in.UserID, AvatarUrl: mediaURL})
	} else {
		err = s.queries.UpdateUserBackgroundURL(ctx, sqlcgen.UpdateUserBackgroundURLParams{UserID: in.UserID, BackgroundUrl: mediaURL})
	}
	if err != nil {
		_ = os.Remove(finalPath)
		return "", fmt.Errorf("update profile image URL: %w", err)
	}

	if in.Kind == "avatar" && s.sessions != nil {
		s.sessions.UpdateAvatar(in.UserID, mediaURL)
	}
	s.removeManagedFile(oldURL)
	return mediaURL, nil
}

func (s *ProfileMediaService) Path(storedName string) (string, error) {
	// ServeMux 已经把路径参数解码；再次要求 Base 完全相等可阻止目录穿越。
	if storedName == "" || filepath.Base(storedName) != storedName || strings.Contains(storedName, "..") {
		return "", ErrInvalidProfileImage
	}
	return filepath.Join(s.mediaDir, storedName), nil
}

func (s *ProfileMediaService) removeManagedFile(mediaURL string) {
	const prefix = "/api/v2/profile-media/"
	if !strings.HasPrefix(mediaURL, prefix) {
		return
	}
	storedName := strings.TrimPrefix(mediaURL, prefix)
	path, err := s.Path(storedName)
	if err == nil {
		_ = os.Remove(path)
	}
}
