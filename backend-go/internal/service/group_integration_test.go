package service

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter2/backend-go/internal/repository"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

// TestGroupServiceIntegrationCreateSendHistory verifies the real database path:
// create group -> send group message -> history query -> non-member rejection.
//
// Run with:
//
//	CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/service -run GroupIntegration
func TestGroupServiceIntegrationCreateSendHistory(t *testing.T) {
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
	aliceID := insertTestUser(t, pool, "grp_alice_"+suffix, "Alice")
	bobID := insertTestUser(t, pool, "grp_bob_"+suffix, "Bob")
	carolID := insertTestUser(t, pool, "grp_carol_"+suffix, "Carol")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id IN ($1, $2, $3))`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
	})

	sessions := session.NewManager()
	sessions.Register(&session.Session{
		UserID:   aliceID,
		Username: "grp_alice_" + suffix,
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	})

	groupRepo := repository.NewGroupsRepository(pool)
	userRepo := repository.NewUserRepository(pool)
	gs := NewGroupService(groupRepo, userRepo, sessions)

	// Create a group with alice as owner and bob as member.
	group, err := gs.CreateGroup(ctx, aliceID, "grp_alice_"+suffix, "Alice", "test-group", []string{"grp_bob_" + suffix})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}
	if group.MemberCount != 2 {
		t.Fatalf("expected 2 members, got %d", group.MemberCount)
	}

	// Verify group appears in alice's list.
	groups, err := gs.GetUserGroups(ctx, aliceID)
	if err != nil {
		t.Fatalf("get user groups: %v", err)
	}
	if len(groups) != 1 || groups[0].GroupID != group.GroupID {
		t.Fatalf("expected group in alice's list: %#v", groups)
	}

	// Verify bob can see the group too.
	groups, err = gs.GetUserGroups(ctx, bobID)
	if err != nil {
		t.Fatalf("get user groups for bob: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("expected bob to see the group, got %d", len(groups))
	}

	// Send a group message as alice.
	aliceSess := sessions.GetByID(aliceID)
	if aliceSess == nil {
		t.Fatalf("alice session not found")
	}
	msg, usernames, err := gs.SendGroupMessage(ctx, aliceSess, group.GroupID, "hello group")
	if err != nil {
		t.Fatalf("send group message: %v", err)
	}
	if msg.Scope != "group" || msg.GroupID != group.GroupID || msg.Content != "hello group" {
		t.Fatalf("unexpected group message: %#v", msg)
	}
	if len(usernames) != 2 {
		t.Fatalf("expected 2 broadcast targets, got %d", len(usernames))
	}

	// Get group history.
	history, nextCursor, err := gs.GetGroupHistory(ctx, aliceID, group.GroupID, "", 50)
	if err != nil {
		t.Fatalf("get group history: %v", err)
	}
	if nextCursor != "" {
		t.Fatalf("expected empty next cursor with 1 message, got %q", nextCursor)
	}
	if len(history) != 1 || history[0].Content != "hello group" {
		t.Fatalf("unexpected group history: %#v", history)
	}

	// Non-member cannot send group message.
	carolSess := &session.Session{
		UserID:   carolID,
		Username: "grp_carol_" + suffix,
		Nickname: "Carol",
		Send:     make(chan []byte, 1),
	}
	_, _, err = gs.SendGroupMessage(ctx, carolSess, group.GroupID, "i shouldn't be here")
	if !errors.Is(err, ErrNotGroupMember) {
		t.Fatalf("expected ErrNotGroupMember, got %v", err)
	}

	// Non-member cannot view group history.
	_, _, err = gs.GetGroupHistory(ctx, carolID, group.GroupID, "", 50)
	if !errors.Is(err, ErrNotGroupMember) {
		t.Fatalf("expected ErrNotGroupMember for non-member history, got %v", err)
	}
}
