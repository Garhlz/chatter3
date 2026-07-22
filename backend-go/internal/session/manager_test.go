package session

import (
	"testing"
	"time"
)

func TestRegisterKeepsMultipleSessionsForSameUser(t *testing.T) {
	manager := NewManager()

	first := &Session{
		UserID:   1,
		Username: "alice",
		Send:     make(chan []byte, 1),
	}
	second := &Session{
		UserID:   1,
		Username: "alice",
		Send:     make(chan []byte, 1),
	}

	if firstConnection := manager.Register(first); !firstConnection {
		t.Fatalf("expected first connection to make user online")
	}
	if firstConnection := manager.Register(second); firstConnection {
		t.Fatalf("expected second connection to keep existing online state")
	}

	if got := manager.Get("alice"); got != second {
		t.Fatalf("expected most recently registered session, got %#v", got)
	}
	if !manager.Send("alice", []byte("hello")) {
		t.Fatalf("expected send to reach active sessions")
	}
	if string(<-first.Send) != "hello" || string(<-second.Send) != "hello" {
		t.Fatalf("expected both sessions to receive the message")
	}
}

func TestRemoveSessionKeepsUserOnlineWhileAnotherSessionRemains(t *testing.T) {
	manager := NewManager()

	first := &Session{
		UserID:   1,
		Username: "alice",
		Send:     make(chan []byte, 1),
	}
	second := &Session{
		UserID:   1,
		Username: "alice",
		Send:     make(chan []byte, 1),
	}

	manager.Register(first)
	manager.Register(second)
	becameOffline := manager.RemoveSession(first)

	if becameOffline {
		t.Fatalf("expected user to remain online")
	}
	if got := manager.Get("alice"); got != second {
		t.Fatalf("expected second active session to remain registered, got %#v", got)
	}
}

func TestRemoveSessionReportsCurrentSessionRemoval(t *testing.T) {
	manager := NewManager()
	current := &Session{
		UserID:   1,
		Username: "alice",
		Send:     make(chan []byte, 1),
	}

	manager.Register(current)

	if removed := manager.RemoveSession(current); !removed {
		t.Fatalf("expected current session to be removed")
	}
	if got := manager.Get("alice"); got != nil {
		t.Fatalf("expected no session after removal, got %#v", got)
	}
}

func TestExpireIdleSessionsRemovesOnlyTimedOutOnes(t *testing.T) {
	manager := NewManager()
	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)

	stale := &Session{
		UserID:        1,
		Username:      "stale",
		LastHeartbeat: now.Add(-2 * time.Minute),
		Send:          make(chan []byte, 1),
	}
	fresh := &Session{
		UserID:        2,
		Username:      "fresh",
		LastHeartbeat: now.Add(-10 * time.Second),
		Send:          make(chan []byte, 1),
	}

	manager.Register(stale)
	manager.Register(fresh)

	expired := manager.ExpireIdleSessions(now, 30*time.Second)
	if len(expired) != 1 || expired[0].Session != stale || !expired[0].BecameOffline {
		t.Fatalf("expected only stale session to expire, got %#v", expired)
	}
	if manager.Get("stale") != nil {
		t.Fatalf("expected stale session to be removed")
	}
	if manager.Get("fresh") != fresh {
		t.Fatalf("expected fresh session to remain registered")
	}
}

func TestExpireIdleSessionDoesNotOfflineAnotherConnection(t *testing.T) {
	manager := NewManager()
	now := time.Date(2026, 5, 15, 10, 0, 0, 0, time.UTC)
	stale := &Session{UserID: 1, Username: "alice", LastHeartbeat: now.Add(-2 * time.Minute), Send: make(chan []byte, 1)}
	fresh := &Session{UserID: 1, Username: "alice", LastHeartbeat: now.Add(-5 * time.Second), Send: make(chan []byte, 1)}
	manager.Register(stale)
	manager.Register(fresh)

	expired := manager.ExpireIdleSessions(now, 30*time.Second)
	if len(expired) != 1 || expired[0].Session != stale || expired[0].BecameOffline {
		t.Fatalf("expected only stale connection without offline transition, got %#v", expired)
	}
	if manager.Get("alice") != fresh || !manager.IsOnline("alice") {
		t.Fatalf("expected fresh connection to keep alice online")
	}
}

func TestOnlineSnapshotsSortedByUsername(t *testing.T) {
	manager := NewManager()

	manager.Register(&Session{
		UserID:   2,
		Username: "zoe",
		Nickname: "Zoe",
		Send:     make(chan []byte, 1),
	})
	manager.Register(&Session{
		UserID:   1,
		Username: "alice",
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	})

	got := manager.OnlineSnapshots()
	if len(got) != 2 {
		t.Fatalf("expected 2 snapshots, got %d", len(got))
	}
	if got[0].Username != "alice" || got[1].Username != "zoe" {
		t.Fatalf("expected username-sorted snapshots, got %#v", got)
	}
}
