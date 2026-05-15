package service

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

// TestMessageServiceIntegrationSendAndHistory verifies the real database path:
// user lookup -> message insert -> history query -> protocol message assembly.
//
// It is opt-in because normal unit tests should not require Docker PostgreSQL.
// Run with:
//
//	CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run Integration
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

	sessions := session.NewManager()
	aliceSession := &session.Session{
		UserID:   aliceID,
		Username: "alice_" + suffix,
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	}
	sessions.Register(aliceSession)

	msgSvc := NewMessageService(
		repository.NewMessageRepository(pool),
		sessions,
		repository.NewUserRepository(pool),
	)

	publicMsg, err := msgSvc.CreatePublicMessage(ctx, aliceSession, "  hello public  ")
	if err != nil {
		t.Fatalf("create public message: %v", err)
	}
	if publicMsg.Content != "hello public" || publicMsg.Scope != "public" {
		t.Fatalf("unexpected public message: %#v", publicMsg)
	}

	publicHistory, _, err := msgSvc.GetPublicHistory(ctx, "", 50)
	if err != nil {
		t.Fatalf("get public history: %v", err)
	}
	if !containsMessage(publicHistory, publicMsg.MessageID, "hello public") {
		t.Fatalf("public history does not contain inserted message: %#v", publicHistory)
	}

	receiverUsername, privateMsg, err := msgSvc.CreatePrivateMessage(ctx, aliceSession, "bob_"+suffix, " hello private ")
	if err != nil {
		t.Fatalf("create private message: %v", err)
	}
	if receiverUsername != "bob_"+suffix {
		t.Fatalf("expected receiver username bob_%s, got %q", suffix, receiverUsername)
	}
	if privateMsg.Content != "hello private" || privateMsg.ReceiverUsername != receiverUsername {
		t.Fatalf("unexpected private message: %#v", privateMsg)
	}

	privateHistory, _, err := msgSvc.GetPrivateHistory(ctx, aliceID, receiverUsername, "", 50)
	if err != nil {
		t.Fatalf("get private history: %v", err)
	}
	if !containsMessage(privateHistory, privateMsg.MessageID, "hello private") {
		t.Fatalf("private history does not contain inserted message: %#v", privateHistory)
	}

	bobHistory, _, err := msgSvc.GetPrivateHistory(ctx, bobID, aliceSession.Username, "", 50)
	if err != nil {
		t.Fatalf("get reverse private history: %v", err)
	}
	if !containsMessage(bobHistory, privateMsg.MessageID, "hello private") {
		t.Fatalf("reverse private history does not contain inserted message: %#v", bobHistory)
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
