package repository

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// --- User repository integration tests ---

func TestUserRepositoryIntegration(t *testing.T) {
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
	repo := NewUserRepository(pool)

	t.Run("CreateAndGetByUsername", func(t *testing.T) {
		userID, err := repo.Create(ctx, "repo_usr_"+suffix, "password-hash", "TestUser")
		if err != nil {
			t.Fatalf("create user: %v", err)
		}
		if userID <= 0 {
			t.Fatalf("expected positive userID, got %d", userID)
		}
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID)
		})

		u, err := repo.GetByUsername(ctx, "repo_usr_"+suffix)
		if err != nil {
			t.Fatalf("get by username: %v", err)
		}
		if u.Username != "repo_usr_"+suffix || u.Nickname != "TestUser" {
			t.Fatalf("unexpected user: %#v", u)
		}

		u2, err := repo.GetByID(ctx, userID)
		if err != nil {
			t.Fatalf("get by id: %v", err)
		}
		if u2.UserID != userID {
			t.Fatalf("unexpected userID: %d", u2.UserID)
		}
	})

	t.Run("NotFound", func(t *testing.T) {
		_, err := repo.GetByUsername(ctx, "no_such_user_"+suffix)
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("expected ErrNotFound, got %v", err)
		}

		_, err = repo.GetByID(ctx, 99999999)
		if !errors.Is(err, ErrNotFound) {
			t.Fatalf("expected ErrNotFound for GetByID, got %v", err)
		}
	})

	t.Run("UsernameTaken", func(t *testing.T) {
		username := "repo_dup_" + suffix
		userID, err := repo.Create(ctx, username, "hash", "First")
		if err != nil {
			t.Fatalf("create first user: %v", err)
		}
		t.Cleanup(func() {
			_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, userID)
		})

		_, err = repo.Create(ctx, username, "hash", "Second")
		if !errors.Is(err, ErrUsernameTaken) {
			t.Fatalf("expected ErrUsernameTaken, got %v", err)
		}
	})
}

// --- Message repository integration tests ---

func TestMessageRepositoryIntegration(t *testing.T) {
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
	userRepo := NewUserRepository(pool)
	aliceID, _ := userRepo.Create(ctx, "repo_msg_a_"+suffix, "hash", "Alice")
	bobID, _ := userRepo.Create(ctx, "repo_msg_b_"+suffix, "hash", "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2) OR receiver_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	msgRepo := NewMessageRepository(pool)

	t.Run("InsertPublicAndHistory", func(t *testing.T) {
		inserted, err := msgRepo.InsertPublicMessage(ctx, aliceID, 0, "hello public")
		if err != nil {
			t.Fatalf("insert public message: %v", err)
		}
		if inserted.MessageID <= 0 {
			t.Fatalf("expected positive messageID, got %d", inserted.MessageID)
		}

		msgs, err := msgRepo.GetPublicHistory(ctx, 0, 50)
		if err != nil {
			t.Fatalf("get public history: %v", err)
		}
		found := false
		for _, m := range msgs {
			if m.MessageID == inserted.MessageID && m.Content == "hello public" && m.Username == "repo_msg_a_"+suffix {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("inserted public message not found in history")
		}
	})

	t.Run("InsertPrivateAndHistory", func(t *testing.T) {
		inserted, err := msgRepo.InsertPrivateMessage(ctx, aliceID, bobID, 0, "hello private")
		if err != nil {
			t.Fatalf("insert private message: %v", err)
		}

		msgs, err := msgRepo.GetPrivateHistory(ctx, aliceID, bobID, 0, 50)
		if err != nil {
			t.Fatalf("get private history: %v", err)
		}
		found := false
		for _, m := range msgs {
			if m.MessageID == inserted.MessageID && m.Content == "hello private" {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("inserted private message not found in history")
		}
	})
}

// --- Group repository integration tests ---

func TestGroupRepositoryIntegration(t *testing.T) {
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
	userRepo := NewUserRepository(pool)
	aliceID, _ := userRepo.Create(ctx, "repo_grp_a_"+suffix, "hash", "Alice")
	bobID, _ := userRepo.Create(ctx, "repo_grp_b_"+suffix, "hash", "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id IN ($1, $2))`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	groupRepo := NewGroupsRepository(pool)

	t.Run("CreateGroupAndGetByID", func(t *testing.T) {
		row, err := groupRepo.CreateGroup(ctx, "test-group", aliceID)
		if err != nil {
			t.Fatalf("create group: %v", err)
		}
		if row.GroupID <= 0 {
			t.Fatalf("expected positive groupID, got %d", row.GroupID)
		}

		g, err := groupRepo.GetGroupByID(ctx, row.GroupID)
		if err != nil {
			t.Fatalf("get group by id: %v", err)
		}
		if g.GroupName != "test-group" || g.CreatorID != aliceID {
			t.Fatalf("unexpected group: %#v", g)
		}
	})

	t.Run("AddMemberAndIsMember", func(t *testing.T) {
		row, _ := groupRepo.CreateGroup(ctx, "member-test", aliceID)

		if err := groupRepo.AddMember(ctx, row.GroupID, aliceID, 2); err != nil {
			t.Fatalf("add owner: %v", err)
		}
		if err := groupRepo.AddMember(ctx, row.GroupID, bobID, 0); err != nil {
			t.Fatalf("add member: %v", err)
		}

		isMember, err := groupRepo.IsMember(ctx, row.GroupID, aliceID)
		if err != nil {
			t.Fatalf("is member alice: %v", err)
		}
		if !isMember {
			t.Fatalf("alice should be a member")
		}

		isMember, err = groupRepo.IsMember(ctx, row.GroupID, bobID)
		if err != nil {
			t.Fatalf("is member bob: %v", err)
		}
		if !isMember {
			t.Fatalf("bob should be a member")
		}

		members, err := groupRepo.GetGroupMembers(ctx, row.GroupID)
		if err != nil {
			t.Fatalf("get members: %v", err)
		}
		if len(members) != 2 {
			t.Fatalf("expected 2 members, got %d", len(members))
		}

		usernames, err := groupRepo.GetMemberUsernames(ctx, row.GroupID)
		if err != nil {
			t.Fatalf("get member usernames: %v", err)
		}
		if len(usernames) != 2 {
			t.Fatalf("expected 2 usernames, got %d", len(usernames))
		}
	})

	t.Run("InsertGroupMessageAndHistory", func(t *testing.T) {
		row, _ := groupRepo.CreateGroup(ctx, "msg-test", aliceID)
		_ = groupRepo.AddMember(ctx, row.GroupID, aliceID, 2)

		inserted, err := groupRepo.InsertGroupMessage(ctx, aliceID, row.GroupID, 0, "hello group")
		if err != nil {
			t.Fatalf("insert group message: %v", err)
		}

		msgs, err := groupRepo.GetGroupHistory(ctx, row.GroupID, 0, 50)
		if err != nil {
			t.Fatalf("get group history: %v", err)
		}
		found := false
		for _, m := range msgs {
			if m.MessageID == inserted.MessageID && m.Content == "hello group" {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("inserted group message not found in history")
		}
	})
}
