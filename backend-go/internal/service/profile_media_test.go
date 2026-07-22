package service

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter3/backend-go/internal/session"
)

func TestProfileMediaRejectsInvalidKindAndContent(t *testing.T) {
	svc := NewProfileMediaService(nil, nil, t.TempDir())
	if _, err := svc.Save(context.Background(), ProfileImageInput{Kind: "other", Reader: strings.NewReader("x")}); err != ErrInvalidProfileImageKind {
		t.Fatalf("expected invalid kind, got %v", err)
	}
	if _, err := svc.Save(context.Background(), ProfileImageInput{Kind: "avatar", Reader: strings.NewReader("not image")}); err != ErrInvalidProfileImage {
		t.Fatalf("expected invalid image, got %v", err)
	}
	if _, err := svc.Path("../secret.png"); err != ErrInvalidProfileImage {
		t.Fatalf("expected traversal path rejected, got %v", err)
	}
}

func TestProfileMediaIntegrationReplacesManagedAvatar(t *testing.T) {
	databaseURL := os.Getenv("CHATTER_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set CHATTER_TEST_DATABASE_URL to run database integration tests")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer pool.Close()
	suffix := strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
	userID := insertTestUser(t, pool, "media_"+suffix, "Media")
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID) })

	mediaRoot := t.TempDir()
	svc := NewProfileMediaService(sqlcgen.New(pool), session.NewManager(), mediaRoot)
	firstURL, err := svc.Save(ctx, ProfileImageInput{UserID: userID, Kind: "avatar", Reader: tinyPNG(t, color.RGBA{R: 255, A: 255})})
	if err != nil {
		t.Fatalf("save first avatar: %v", err)
	}
	firstPath := filepath.Join(mediaRoot, "profile-media", strings.TrimPrefix(firstURL, "/api/v2/profile-media/"))
	secondURL, err := svc.Save(ctx, ProfileImageInput{UserID: userID, Kind: "avatar", Reader: tinyPNG(t, color.RGBA{B: 255, A: 255})})
	if err != nil || secondURL == firstURL {
		t.Fatalf("replace avatar: url=%q err=%v", secondURL, err)
	}
	if _, err := os.Stat(firstPath); !os.IsNotExist(err) {
		t.Fatalf("expected old managed avatar removed, stat err=%v", err)
	}
}

func tinyPNG(t *testing.T, fill color.Color) *bytes.Reader {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	for y := 0; y < 2; y++ {
		for x := 0; x < 2; x++ {
			img.Set(x, y, fill)
		}
	}
	var data bytes.Buffer
	if err := png.Encode(&data, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return bytes.NewReader(data.Bytes())
}
