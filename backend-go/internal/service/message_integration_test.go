package service

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
	"github.com/elaine/chatter2/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

func TestMessageServiceIntegrationSendAndHistory(t *testing.T) {
	databaseURL := os.Getenv("CHATTER_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set CHATTER_TEST_DATABASE_URL to run database integration tests")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}

	suffix := strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
	aliceID := insertTestUser(t, pool, "alice_"+suffix, "Alice")
	bobID := insertTestUser(t, pool, "bob_"+suffix, "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2) OR receiver_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	queries := sqlcgen.New(pool)
	sessions := session.NewManager()

	aliceSess := &session.Session{
		UserID:   aliceID,
		Username: "alice_" + suffix,
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	}
	sessions.Register(aliceSess)
	bobSess := &session.Session{
		UserID:   bobID,
		Username: "bob_" + suffix,
		Nickname: "Bob",
		Send:     make(chan []byte, 1),
	}
	sessions.Register(bobSess)

	svc := NewMessageService(queries, sessions)

	publicMsg, err := svc.CreatePublicMessage(ctx, aliceSess, "hello public")
	if err != nil {
		t.Fatalf("create public message: %v", err)
	}
	if publicMsg.MessageID <= 0 || publicMsg.Content != "hello public" {
		t.Fatalf("unexpected public message: %#v", publicMsg)
	}

	publicHistory, _, err := svc.GetPublicHistory(ctx, "", 50)
	if err != nil {
		t.Fatalf("get public history: %v", err)
	}
	if !containsMessage(publicHistory, publicMsg.MessageID, "hello public") {
		t.Fatalf("public history does not contain inserted message: %#v", publicHistory)
	}

	receiverUsername, privateMsg, err := svc.CreatePrivateMessage(ctx, aliceSess, "bob_"+suffix, "hello private")
	if err != nil {
		t.Fatalf("create private message: %v", err)
	}
	if receiverUsername != "bob_"+suffix || privateMsg.Content != "hello private" {
		t.Fatalf("unexpected private message: %s %#v", receiverUsername, privateMsg)
	}

	bobHistory, _, err := svc.GetPrivateHistory(ctx, bobID, "alice_"+suffix, "", 50)
	if err != nil {
		t.Fatalf("get private history: %v", err)
	}
	if !containsMessage(bobHistory, privateMsg.MessageID, "hello private") {
		t.Fatalf("reverse private history does not contain inserted message: %#v", bobHistory)
	}
}

func TestMessageServiceIntegrationMissingUsersReturnNotFound(t *testing.T) {
	databaseURL := os.Getenv("CHATTER_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set CHATTER_TEST_DATABASE_URL to run database integration tests")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping test database: %v", err)
	}

	suffix := strings.ReplaceAll(time.Now().UTC().Format("20060102150405.000000000"), ".", "")
	aliceUsername := "alice_nf_" + suffix
	aliceID := insertTestUser(t, pool, aliceUsername, "Alice")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1`, aliceID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, aliceID)
	})

	queries := sqlcgen.New(pool)
	sessions := session.NewManager()
	aliceSess := &session.Session{
		UserID:   aliceID,
		Username: aliceUsername,
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	}
	sessions.Register(aliceSess)

	svc := NewMessageService(queries, sessions)

	_, _, err = svc.GetPrivateHistory(ctx, aliceID, "no_such_user_"+suffix, "", 50)
	if !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected repository.ErrNotFound from GetPrivateHistory, got %v", err)
	}

	_, _, err = svc.CreatePrivateMessage(ctx, aliceSess, "no_such_user_"+suffix, "hello")
	if !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected repository.ErrNotFound from CreatePrivateMessage, got %v", err)
	}
}

func insertTestUser(t *testing.T, pool *pgxpool.Pool, username, nickname string) int64 {
	t.Helper()

	hash, err := bcrypt.GenerateFromPassword([]byte("password123"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	var userID int64
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO users (username, password, nickname) VALUES ($1, $2, $3) RETURNING user_id`,
		username,
		string(hash),
		nickname,
	).Scan(&userID); err != nil {
		t.Fatalf("insert test user %q: %v", username, err)
	}
	return userID
}

func containsMessage(messages []protocolv2.Message, messageID int64, content string) bool {
	for _, msg := range messages {
		if msg.MessageID == messageID && msg.Content == content {
			return true
		}
	}
	return false
}
