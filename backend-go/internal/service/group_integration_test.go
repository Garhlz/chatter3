package service

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/elaine/chatter3/backend-go/internal/repository"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter3/backend-go/internal/session"
)

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

	queries := sqlcgen.New(pool)
	sessions := session.NewManager()
	sessions.Register(&session.Session{
		UserID:   aliceID,
		Username: "grp_alice_" + suffix,
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	})
	sessions.Register(&session.Session{
		UserID:   bobID,
		Username: "grp_bob_" + suffix,
		Nickname: "Bob",
		Send:     make(chan []byte, 1),
	})

	gs := NewGroupService(pool, queries, sessions)

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

func TestGroupServiceIntegrationMissingGroupReturnsNotFound(t *testing.T) {
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
	aliceID := insertTestUser(t, pool, "grp_nf_alice_"+suffix, "Alice")
	bobID := insertTestUser(t, pool, "grp_nf_bob_"+suffix, "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE user_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	queries := sqlcgen.New(pool)
	sessions := session.NewManager()
	sessions.Register(&session.Session{
		UserID:   aliceID,
		Username: "grp_nf_alice_" + suffix,
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	})
	gs := NewGroupService(pool, queries, sessions)

	if _, err := gs.GetGroupMembersForUser(ctx, aliceID, 999999); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected repository.ErrNotFound from GetGroupMembersForUser, got %v", err)
	}
	if _, _, err := gs.GetGroupHistory(ctx, aliceID, 999999, "", 50); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected repository.ErrNotFound from GetGroupHistory, got %v", err)
	}
	if _, err := gs.AddMembers(ctx, aliceID, 999999, []string{"grp_nf_bob_" + suffix}); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected repository.ErrNotFound from AddMembers, got %v", err)
	}
	if err := gs.RemoveMember(ctx, aliceID, 999999, "grp_nf_bob_"+suffix); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("expected repository.ErrNotFound from RemoveMember, got %v", err)
	}
}

func TestGroupServiceIntegrationCreateGroupRollsBackOnMissingMember(t *testing.T) {
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
	aliceID := insertTestUser(t, pool, "grp_rb_alice_"+suffix, "Alice")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id = $1)`, aliceID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id = $1`, aliceID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id = $1`, aliceID)
	})

	queries := sqlcgen.New(pool)
	gs := NewGroupService(pool, queries, session.NewManager())

	_, err = gs.CreateGroup(ctx, aliceID, "grp_rb_alice_"+suffix, "Alice", "rollback-group", []string{"missing-user-" + suffix})
	if !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("expected ErrMemberNotFound, got %v", err)
	}

	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM groups WHERE creator_id = $1`, aliceID).Scan(&count); err != nil {
		t.Fatalf("count groups: %v", err)
	}
	if count != 0 {
		t.Fatalf("expected create rollback to leave 0 groups, got %d", count)
	}
}

func TestGroupServiceIntegrationAddMembersRollsBackOnMissingMember(t *testing.T) {
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
	aliceID := insertTestUser(t, pool, "grp_add_alice_"+suffix, "Alice")
	bobID := insertTestUser(t, pool, "grp_add_bob_"+suffix, "Bob")
	carolID := insertTestUser(t, pool, "grp_add_carol_"+suffix, "Carol")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id IN ($1, $2, $3))`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
	})

	queries := sqlcgen.New(pool)
	gs := NewGroupService(pool, queries, session.NewManager())

	group, err := gs.CreateGroup(ctx, aliceID, "grp_add_alice_"+suffix, "Alice", "add-rollback-group", []string{"grp_add_bob_" + suffix})
	if err != nil {
		t.Fatalf("create group: %v", err)
	}

	_, err = gs.AddMembers(ctx, aliceID, group.GroupID, []string{"grp_add_carol_" + suffix, "missing-user-" + suffix})
	if !errors.Is(err, ErrMemberNotFound) {
		t.Fatalf("expected ErrMemberNotFound, got %v", err)
	}

	members, err := gs.GetGroupMembersForUser(ctx, aliceID, group.GroupID)
	if err != nil {
		t.Fatalf("get group members: %v", err)
	}
	if len(members) != 2 {
		t.Fatalf("expected add rollback to preserve original 2 members, got %d", len(members))
	}
}
