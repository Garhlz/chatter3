package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

func TestHandleV2OnlineUsersReturnsSortedUsers(t *testing.T) {
	sessions := session.NewManager()
	sessions.Register(&session.Session{
		UserID:   2,
		Username: "zoe",
		Nickname: "Zoe",
		Send:     make(chan []byte, 1),
	})
	sessions.Register(&session.Session{
		UserID:   1,
		Username: "alice",
		Nickname: "Alice",
		Send:     make(chan []byte, 1),
	})

	server := &Server{sessions: sessions}
	req := httptest.NewRequest(http.MethodGet, "/api/v2/users/online", nil)
	rec := httptest.NewRecorder()

	server.handleV2OnlineUsers(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var body protocolv2.APIResponse[[]protocolv2.User]
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(body.Data) != 2 {
		t.Fatalf("expected 2 users, got %d", len(body.Data))
	}
	if body.Data[0].Username != "alice" || body.Data[1].Username != "zoe" {
		t.Fatalf("expected sorted users, got %#v", body.Data)
	}
}
