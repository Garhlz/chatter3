package repository

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
)

// TestSqlcQueriesIntegration directly tests the sqlc-generated query functions.
func TestSqlcQueriesIntegration(t *testing.T) {
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
	q := sqlcgen.New(pool)

	t.Run("CreateUser", func(t *testing.T) {
		userID, err := q.CreateUser(ctx, sqlcgen.CreateUserParams{
			Username: "repo_usr_" + suffix, Password: "hash", Nickname: "Test",
		})
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if userID <= 0 {
			t.Fatalf("expected positive userID, got %d", userID)
		}
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID)
		})

		u, err := q.GetUserByUsername(ctx, "repo_usr_"+suffix)
		if err != nil {
			t.Fatalf("get by username: %v", err)
		}
		if u.Username != "repo_usr_"+suffix || u.Nickname != "Test" {
			t.Fatalf("unexpected user: %#v", u)
		}

		_, err = q.GetUserByUsername(ctx, "no_such_user_"+suffix)
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("expected ErrNoRows, got %v", err)
		}

		exists, err := q.ExistsByUsername(ctx, "repo_usr_"+suffix)
		if err != nil {
			t.Fatalf("exists: %v", err)
		}
		if !exists {
			t.Fatalf("expected user to exist")
		}
	})

	t.Run("InsertPublicMessage", func(t *testing.T) {
		userID, _ := q.CreateUser(ctx, sqlcgen.CreateUserParams{
			Username: "repo_pub_" + suffix, Password: "hash", Nickname: "Pub",
		})
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id = $1`, userID)
			_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID)
		})

		row, err := q.InsertPublicMessage(ctx, sqlcgen.InsertPublicMessageParams{
			SenderID: userID, MessageType: 0, Content: "hello world",
		})
		if err != nil {
			t.Fatalf("insert public: %v", err)
		}
		if row.MessageID <= 0 {
			t.Fatalf("expected positive messageID")
		}
	})

	t.Run("CreateGroup", func(t *testing.T) {
		userID, _ := q.CreateUser(ctx, sqlcgen.CreateUserParams{
			Username: "repo_grp_" + suffix, Password: "hash", Nickname: "Grp",
		})
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE user_id = $1`, userID)
			_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id = $1`, userID)
			_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID)
		})

		row, err := q.CreateGroup(ctx, sqlcgen.CreateGroupParams{
			GroupName: "test-group", CreatorID: userID,
		})
		if err != nil {
			t.Fatalf("create group: %v", err)
		}
		if row.GroupID <= 0 {
			t.Fatalf("expected positive groupID")
		}

		if err := q.AddGroupMember(ctx, sqlcgen.AddGroupMemberParams{
			GroupID: row.GroupID, UserID: userID, Role: 2,
		}); err != nil {
			t.Fatalf("add member: %v", err)
		}
	})
}
