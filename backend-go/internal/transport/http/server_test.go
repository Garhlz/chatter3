package http

import (
	"bufio"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter3/backend-go/internal/auth"
	"github.com/elaine/chatter3/backend-go/internal/config"
	protocolv2 "github.com/elaine/chatter3/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter3/backend-go/internal/repository"
	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
	appsvc "github.com/elaine/chatter3/backend-go/internal/service"
	"github.com/elaine/chatter3/backend-go/internal/session"
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

func TestMessageErrorCode(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{name: "empty content", err: appsvc.ErrContentRequired, want: "bad_request"},
		{name: "receiver missing", err: appsvc.ErrReceiverRequired, want: "bad_request"},
		{name: "self dm", err: appsvc.ErrCannotMessageSelf, want: "bad_request"},
		{name: "too long", err: appsvc.ErrContentTooLong, want: "payload_too_large"},
		{name: "target missing", err: repository.ErrNotFound, want: "not_found"},
		{name: "wrapped", err: errors.Join(appsvc.ErrContentTooLong), want: "payload_too_large"},
		{name: "unknown", err: errors.New("database failed"), want: "internal_error"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := messageErrorCode(tt.err); got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestHandleV2WebSocketRequiresToken(t *testing.T) {
	server := newWebSocketTestServer()
	req := httptest.NewRequest(http.MethodGet, "/api/v2/ws", nil)
	rec := httptest.NewRecorder()

	server.handleV2WebSocket(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
	var body protocolv2.APIErrorResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal error response: %v", err)
	}
	if body.Error.Code != "unauthorized" {
		t.Fatalf("expected unauthorized, got %#v", body.Error)
	}
}

func TestHandleV2WebSocketReadyAndPingPong(t *testing.T) {
	server := newWebSocketTestServer()
	token := signTestToken(t, server, 1, "alice", "Alice")

	conn, reader := openTestWebSocket(t, server, token)

	var ready protocolv2.Event[protocolv2.ReadyPayload]
	readTestTextEvent(t, conn, reader, &ready)
	if ready.Event != "session.ready" {
		t.Fatalf("expected session.ready, got %q", ready.Event)
	}
	if ready.Payload.User.Username != "alice" || !ready.Payload.User.Online {
		t.Fatalf("unexpected ready payload: %#v", ready.Payload)
	}
	if server.sessions.Get("alice") == nil {
		t.Fatalf("expected websocket session to be registered")
	}

	writeClientTextFrame(t, conn, `{"event":"session.ping","requestId":"req-1","payload":{}}`)

	var pong protocolv2.Event[protocolv2.PongPayload]
	readTestTextEvent(t, conn, reader, &pong)
	if pong.Event != "session.pong" || pong.RequestID != "req-1" {
		t.Fatalf("unexpected pong event: %#v", pong)
	}
}

func TestHandleV2WebSocketBadJSONReturnsErrorEvent(t *testing.T) {
	server := newWebSocketTestServer()
	token := signTestToken(t, server, 1, "alice", "Alice")

	conn, reader := openTestWebSocket(t, server, token)
	discardReadyEvent(t, reader)

	writeClientTextFrame(t, conn, `{`)

	var event protocolv2.Event[protocolv2.ErrorPayload]
	readTestTextEvent(t, conn, reader, &event)
	if event.Event != "error" || event.Payload.Code != "bad_request" {
		t.Fatalf("expected bad_request error event, got %#v", event)
	}
}

func TestHandleV2WebSocketUnknownEventReturnsNotImplemented(t *testing.T) {
	server := newWebSocketTestServer()
	token := signTestToken(t, server, 1, "alice", "Alice")

	conn, reader := openTestWebSocket(t, server, token)
	discardReadyEvent(t, reader)

	writeClientTextFrame(t, conn, `{"event":"future.event","requestId":"req-future","payload":{}}`)

	var event protocolv2.Event[protocolv2.ErrorPayload]
	readTestTextEvent(t, conn, reader, &event)
	if event.Event != "error" || event.RequestID != "req-future" || event.Payload.Code != "not_implemented" {
		t.Fatalf("expected not_implemented error event, got %#v", event)
	}
}

// TestHandleV2WebSocketIntegrationSendAndDeliver verifies the full realtime path:
// WebSocket event -> message service -> database insert -> realtime delivery.
//
// It is opt-in because normal unit tests should not require Docker PostgreSQL.
// Run with:
//
//	CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run Integration
func TestHandleV2WebSocketIntegrationSendAndDeliver(t *testing.T) {
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
	aliceID := insertHTTPTestUser(t, pool, "ws_alice_"+suffix, "Alice")
	bobID := insertHTTPTestUser(t, pool, "ws_bob_"+suffix, "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2) OR receiver_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	server := newWebSocketIntegrationServer(pool)
	alice := openTestWebSocketForUser(t, server, aliceID, "ws_alice_"+suffix, "Alice")
	bob := openTestWebSocketForUser(t, server, bobID, "ws_bob_"+suffix, "Bob")

	alice.readReady(t)
	bob.readReady(t)

	alice.writeText(t, `{"event":"chat.public.send","requestId":"pub-1","payload":{"content":" hello from public "}}`)

	alicePublic := alice.readMessageEvent(t, "chat.public.message")
	bobPublic := bob.readMessageEvent(t, "chat.public.message")
	if alicePublic.RequestID != "pub-1" || bobPublic.RequestID != "pub-1" {
		t.Fatalf("expected public request id to be echoed, got %#v %#v", alicePublic, bobPublic)
	}
	if alicePublic.Payload.MessageID != bobPublic.Payload.MessageID || alicePublic.Payload.Content != "hello from public" {
		t.Fatalf("unexpected public delivery: %#v %#v", alicePublic.Payload, bobPublic.Payload)
	}

	publicHistory, _, err := server.msgSvc.GetPublicHistory(ctx, "", 50)
	if err != nil {
		t.Fatalf("get public history: %v", err)
	}
	if !containsHTTPMessage(publicHistory, alicePublic.Payload.MessageID, "hello from public") {
		t.Fatalf("public history does not contain websocket message: %#v", publicHistory)
	}

	alice.writeText(t, `{"event":"chat.private.send","requestId":"dm-1","payload":{"receiverUsername":"ws_bob_`+suffix+`","content":" hello from dm "}}`)

	alicePrivate := alice.readMessageEvent(t, "chat.private.message")
	bobPrivate := bob.readMessageEvent(t, "chat.private.message")
	if alicePrivate.RequestID != "dm-1" || bobPrivate.RequestID != "dm-1" {
		t.Fatalf("expected private request id to be echoed, got %#v %#v", alicePrivate, bobPrivate)
	}
	if alicePrivate.Payload.MessageID != bobPrivate.Payload.MessageID ||
		alicePrivate.Payload.ReceiverUsername != "ws_bob_"+suffix ||
		alicePrivate.Payload.Content != "hello from dm" {
		t.Fatalf("unexpected private delivery: %#v %#v", alicePrivate.Payload, bobPrivate.Payload)
	}

	privateHistory, _, err := server.msgSvc.GetPrivateHistory(ctx, aliceID, "ws_bob_"+suffix, "", 50)
	if err != nil {
		t.Fatalf("get private history: %v", err)
	}
	if !containsHTTPMessage(privateHistory, alicePrivate.Payload.MessageID, "hello from dm") {
		t.Fatalf("private history does not contain websocket message: %#v", privateHistory)
	}

	bob.close(t)
	waitForSessionGone(t, server.sessions, "ws_bob_"+suffix)

	alice.writeText(t, `{"event":"chat.private.send","requestId":"dm-offline","payload":{"receiverUsername":"ws_bob_`+suffix+`","content":" offline dm "}}`)

	offlinePrivate := alice.readMessageEvent(t, "chat.private.message")
	if offlinePrivate.RequestID != "dm-offline" || offlinePrivate.Payload.Content != "offline dm" {
		t.Fatalf("unexpected offline private delivery: %#v", offlinePrivate)
	}
	offlineHistory, _, err := server.msgSvc.GetPrivateHistory(ctx, bobID, "ws_alice_"+suffix, "", 50)
	if err != nil {
		t.Fatalf("get offline private history: %v", err)
	}
	if !containsHTTPMessage(offlineHistory, offlinePrivate.Payload.MessageID, "offline dm") {
		t.Fatalf("offline private history does not contain websocket message: %#v", offlineHistory)
	}
}

func TestHandleV2FileUploadAndDownloadIntegration(t *testing.T) {
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
	aliceID := insertHTTPTestUser(t, pool, "file_alice_"+suffix, "Alice")
	bobID := insertHTTPTestUser(t, pool, "file_bob_"+suffix, "Bob")
	carolID := insertHTTPTestUser(t, pool, "file_carol_"+suffix, "Carol")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM files WHERE message_id IN (SELECT message_id FROM messages WHERE sender_id IN ($1, $2, $3) OR receiver_id IN ($1, $2, $3))`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id = $1)`, aliceID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2, $3) OR receiver_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id = $1`, aliceID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
	})

	uploadDir := t.TempDir()
	server := newFileIntegrationServer(pool, uploadDir)

	publicFileID := uploadFileAs(
		t,
		server,
		aliceID,
		"file_alice_"+suffix,
		"Alice",
		"hello.txt",
		"hello public file",
		"",
	)

	publicHistory, _, err := server.msgSvc.GetPublicHistory(ctx, "", 50)
	if err != nil {
		t.Fatalf("get public history: %v", err)
	}
	if !containsHTTPFileMessage(publicHistory, publicFileID, "hello.txt") {
		t.Fatalf("public history does not contain uploaded file message: %#v", publicHistory)
	}

	publicBody := downloadFileAs(t, server, bobID, "file_bob_"+suffix, "Bob", publicFileID, http.StatusOK)
	if string(publicBody) != "hello public file" {
		t.Fatalf("unexpected public download body: %q", string(publicBody))
	}

	privateFileID := uploadFileAs(
		t,
		server,
		aliceID,
		"file_alice_"+suffix,
		"Alice",
		"secret.txt",
		"hello private file",
		"file_bob_"+suffix,
	)

	privateHistory, _, err := server.msgSvc.GetPrivateHistory(ctx, aliceID, "file_bob_"+suffix, "", 50)
	if err != nil {
		t.Fatalf("get private history: %v", err)
	}
	if !containsHTTPFileMessage(privateHistory, privateFileID, "secret.txt") {
		t.Fatalf("private history does not contain uploaded file message: %#v", privateHistory)
	}

	privateBody := downloadFileAs(t, server, bobID, "file_bob_"+suffix, "Bob", privateFileID, http.StatusOK)
	if string(privateBody) != "hello private file" {
		t.Fatalf("unexpected private download body: %q", string(privateBody))
	}

	downloadFileAs(t, server, carolID, "file_carol_"+suffix, "Carol", privateFileID, http.StatusForbidden)

	server.groupSvc = appsvc.NewGroupService(pool, sqlcgen.New(pool), server.sessions)
	group, err := server.groupSvc.CreateGroup(
		ctx, aliceID, "file_alice_"+suffix, "Alice", "file-group", []string{"file_bob_" + suffix},
	)
	if err != nil {
		t.Fatalf("create file test group: %v", err)
	}
	groupFileID := uploadFileAsTarget(
		t, server, aliceID, "file_alice_"+suffix, "Alice",
		"group.txt", "hello group file", "", group.GroupID,
	)
	downloadFileAs(t, server, bobID, "file_bob_"+suffix, "Bob", groupFileID, http.StatusOK)
	downloadFileAs(t, server, carolID, "file_carol_"+suffix, "Carol", groupFileID, http.StatusForbidden)
}

func TestHandleV2FileUploadErrorsIntegration(t *testing.T) {
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
	aliceID := insertHTTPTestUser(t, pool, "fu_alice_"+suffix, "Alice")
	bobID := insertHTTPTestUser(t, pool, "fu_bob_"+suffix, "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2) OR receiver_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	uploadDir := t.TempDir()
	// Use a very small max to trigger file-too-large errors easily.
	server := newFileIntegrationServer(pool, uploadDir)
	server.cfg.MaxFileSize = 4
	queries := sqlcgen.New(pool)
	server.fileSvc = appsvc.NewFileService(
		pool,
		queries,
		server.sessions,
		uploadDir,
		4,
	)

	// File too large — upload exceeds server max.
	uploadFileExpectStatus(t, server, aliceID, "fu_alice_"+suffix, "Alice",
		"big.txt", "this content is definitely over the 4 byte limit", "",
		http.StatusRequestEntityTooLarge)

	// Private upload to a non-existent user.
	uploadFileExpectStatus(t, server, aliceID, "fu_alice_"+suffix, "Alice",
		"secret.txt", "hello", "no_such_user_"+suffix,
		http.StatusNotFound)

	// Private upload to self.
	uploadFileExpectStatus(t, server, aliceID, "fu_alice_"+suffix, "Alice",
		"secret.txt", "hello", "fu_alice_"+suffix,
		http.StatusBadRequest)

	// Upload without file field.
	token := signTestToken(t, server, aliceID, "fu_alice_"+suffix, "Alice")
	req := httptest.NewRequest(http.MethodPost, "/api/v2/files/upload", strings.NewReader(""))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "multipart/form-data; boundary=xxx")
	rec := httptest.NewRecorder()
	server.auth(server.handleV2Upload)(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing file, got %d body=%s", rec.Code, rec.Body.String())
	}

	// Download with invalid file ID.
	downloadFileExpectStatus(t, server, aliceID, "fu_alice_"+suffix, "Alice",
		99999, http.StatusNotFound)

	// Download with zero/negative file ID.
	req2 := httptest.NewRequest(http.MethodGet, "/api/v2/files/0", nil)
	req2.SetPathValue("fileID", "0")
	req2.Header.Set("Authorization", "Bearer "+token)
	rec2 := httptest.NewRecorder()
	server.auth(server.handleV2Download)(rec2, req2)
	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for zero file id, got %d body=%s", rec2.Code, rec2.Body.String())
	}
}

// TestHandleV2GroupWebSocketIntegration verifies the full group chat realtime path:
// create group via HTTP -> both members connect via WebSocket ->
// one sends chat.group.send -> both receive chat.group.message.
//
// Run with:
//
//	CHATTER_TEST_DATABASE_URL="$DATABASE_URL" go test ./internal/transport/http -run GroupIntegration
func TestHandleV2GroupWebSocketIntegration(t *testing.T) {
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
	aliceID := insertHTTPTestUser(t, pool, "gws_alice_"+suffix, "Alice")
	bobID := insertHTTPTestUser(t, pool, "gws_bob_"+suffix, "Bob")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id IN ($1, $2))`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id IN ($1, $2)`, aliceID, bobID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2)`, aliceID, bobID)
	})

	server := newGroupIntegrationServer(pool)
	alice := openTestWebSocketForUser(t, server, aliceID, "gws_alice_"+suffix, "Alice")
	bob := openTestWebSocketForUser(t, server, bobID, "gws_bob_"+suffix, "Bob")

	alice.readReady(t)
	bob.readReady(t)

	// Create a group with alice as owner and bob as member via HTTP.
	token := signTestToken(t, server, aliceID, "gws_alice_"+suffix, "Alice")
	createBody := strings.NewReader(`{"groupName":"Test Group","members":["gws_bob_` + suffix + `"]}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v2/groups", createBody)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	server.auth(server.handleV2CreateGroup)(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create group via HTTP: expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	var createResp protocolv2.APIResponse[protocolv2.CreateGroupResponse]
	if err := json.Unmarshal(rec.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("unmarshal create group response: %v", err)
	}
	groupID := createResp.Data.Group.GroupID

	// Alice sends a group message via WebSocket.
	alice.writeText(t, fmt.Sprintf(`{"event":"chat.group.send","requestId":"g-1","payload":{"groupID":%d,"content":"hello group"}}`, groupID))

	// Both receive the group message.
	aliceMsg := alice.readMessageEvent(t, "chat.group.message")
	bobMsg := bob.readMessageEvent(t, "chat.group.message")
	if aliceMsg.RequestID != "g-1" || bobMsg.RequestID != "g-1" {
		t.Fatalf("expected group request id to be echoed, got %#v %#v", aliceMsg, bobMsg)
	}
	if aliceMsg.Payload.GroupID != groupID || aliceMsg.Payload.Scope != "group" || aliceMsg.Payload.Content != "hello group" {
		t.Fatalf("unexpected group delivery: %#v", aliceMsg.Payload)
	}
	if bobMsg.Payload.GroupID != groupID || bobMsg.Payload.Content != "hello group" {
		t.Fatalf("unexpected group delivery to bob: %#v", bobMsg.Payload)
	}

	// Verify group history via HTTP.
	historyReq := httptest.NewRequest(http.MethodGet, "/api/v2/groups/"+strconv.FormatInt(groupID, 10)+"/history", nil)
	historyReq.SetPathValue("groupID", strconv.FormatInt(groupID, 10))
	historyReq.Header.Set("Authorization", "Bearer "+token)
	historyRec := httptest.NewRecorder()
	server.auth(server.handleV2GroupHistory)(historyRec, historyReq)
	if historyRec.Code != http.StatusOK {
		t.Fatalf("get group history: expected 200, got %d body=%s", historyRec.Code, historyRec.Body.String())
	}

	var cursorResp protocolv2.CursorResponse[protocolv2.Message]
	if err := json.Unmarshal(historyRec.Body.Bytes(), &cursorResp); err != nil {
		t.Fatalf("unmarshal group history: %v", err)
	}
	if len(cursorResp.Data) != 1 || cursorResp.Data[0].Content != "hello group" {
		t.Fatalf("unexpected group history: %#v", cursorResp)
	}
}

func TestHandleV2GroupHTTPErrorsIntegration(t *testing.T) {
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
	aliceID := insertHTTPTestUser(t, pool, "ght_alice_"+suffix, "Alice")
	bobID := insertHTTPTestUser(t, pool, "ght_bob_"+suffix, "Bob")
	carolID := insertHTTPTestUser(t, pool, "ght_carol_"+suffix, "Carol")
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM group_members WHERE group_id IN (SELECT group_id FROM groups WHERE creator_id IN ($1, $2, $3))`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM messages WHERE sender_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM groups WHERE creator_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE user_id IN ($1, $2, $3)`, aliceID, bobID, carolID)
	})

	server := newGroupIntegrationServer(pool)
	aliceToken := signTestToken(t, server, aliceID, "ght_alice_"+suffix, "Alice")
	bobToken := signTestToken(t, server, bobID, "ght_bob_"+suffix, "Bob")
	carolToken := signTestToken(t, server, carolID, "ght_carol_"+suffix, "Carol")

	createBody := strings.NewReader(`{"groupName":"Errors Group","members":["ght_bob_` + suffix + `"]}`)
	createReq := httptest.NewRequest(http.MethodPost, "/api/v2/groups", createBody)
	createReq.Header.Set("Authorization", "Bearer "+aliceToken)
	createReq.Header.Set("Content-Type", "application/json")
	createRec := httptest.NewRecorder()
	server.auth(server.handleV2CreateGroup)(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create group via HTTP: expected 201, got %d body=%s", createRec.Code, createRec.Body.String())
	}

	var createResp protocolv2.APIResponse[protocolv2.CreateGroupResponse]
	if err := json.Unmarshal(createRec.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("unmarshal create group response: %v", err)
	}
	groupID := createResp.Data.Group.GroupID

	req := httptest.NewRequest(http.MethodGet, "/api/v2/groups/999999/members", nil)
	req.SetPathValue("groupID", "999999")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	rec := httptest.NewRecorder()
	server.auth(server.handleV2GroupMembers)(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing group members, got %d body=%s", rec.Code, rec.Body.String())
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v2/groups/999999/history", nil)
	req.SetPathValue("groupID", "999999")
	req.Header.Set("Authorization", "Bearer "+aliceToken)
	rec = httptest.NewRecorder()
	server.auth(server.handleV2GroupHistory)(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing group history, got %d body=%s", rec.Code, rec.Body.String())
	}

	addReq := httptest.NewRequest(http.MethodPost, "/api/v2/groups/999999/members", strings.NewReader(`{"usernames":["ght_carol_`+suffix+`"]}`))
	addReq.SetPathValue("groupID", "999999")
	addReq.Header.Set("Authorization", "Bearer "+aliceToken)
	addReq.Header.Set("Content-Type", "application/json")
	addRec := httptest.NewRecorder()
	server.auth(server.handleV2AddGroupMembers)(addRec, addReq)
	if addRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for add members on missing group, got %d body=%s", addRec.Code, addRec.Body.String())
	}

	removeReq := httptest.NewRequest(http.MethodDelete, "/api/v2/groups/999999/members/ght_bob_"+suffix, nil)
	removeReq.SetPathValue("groupID", "999999")
	removeReq.SetPathValue("username", "ght_bob_"+suffix)
	removeReq.Header.Set("Authorization", "Bearer "+aliceToken)
	removeRec := httptest.NewRecorder()
	server.auth(server.handleV2RemoveGroupMember)(removeRec, removeReq)
	if removeRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for remove member on missing group, got %d body=%s", removeRec.Code, removeRec.Body.String())
	}

	historyReq := httptest.NewRequest(http.MethodGet, "/api/v2/groups/"+strconv.FormatInt(groupID, 10)+"/history", nil)
	historyReq.SetPathValue("groupID", strconv.FormatInt(groupID, 10))
	historyReq.Header.Set("Authorization", "Bearer "+carolToken)
	historyRec := httptest.NewRecorder()
	server.auth(server.handleV2GroupHistory)(historyRec, historyReq)
	if historyRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-member group history, got %d body=%s", historyRec.Code, historyRec.Body.String())
	}

	getGroupReq := httptest.NewRequest(http.MethodGet, "/api/v2/groups/"+strconv.FormatInt(groupID, 10), nil)
	getGroupReq.SetPathValue("groupID", strconv.FormatInt(groupID, 10))
	getGroupReq.Header.Set("Authorization", "Bearer "+carolToken)
	getGroupRec := httptest.NewRecorder()
	server.auth(server.handleV2GetGroup)(getGroupRec, getGroupReq)
	if getGroupRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-member get group, got %d body=%s", getGroupRec.Code, getGroupRec.Body.String())
	}

	getMembersReq := httptest.NewRequest(http.MethodGet, "/api/v2/groups/"+strconv.FormatInt(groupID, 10)+"/members", nil)
	getMembersReq.SetPathValue("groupID", strconv.FormatInt(groupID, 10))
	getMembersReq.Header.Set("Authorization", "Bearer "+carolToken)
	getMembersRec := httptest.NewRecorder()
	server.auth(server.handleV2GroupMembers)(getMembersRec, getMembersReq)
	if getMembersRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-member get members, got %d body=%s", getMembersRec.Code, getMembersRec.Body.String())
	}

	addReq = httptest.NewRequest(http.MethodPost, "/api/v2/groups/"+strconv.FormatInt(groupID, 10)+"/members", strings.NewReader(`{"usernames":["ght_carol_`+suffix+`"]}`))
	addReq.SetPathValue("groupID", strconv.FormatInt(groupID, 10))
	addReq.Header.Set("Authorization", "Bearer "+bobToken)
	addReq.Header.Set("Content-Type", "application/json")
	addRec = httptest.NewRecorder()
	server.auth(server.handleV2AddGroupMembers)(addRec, addReq)
	if addRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin add members, got %d body=%s", addRec.Code, addRec.Body.String())
	}

	removeReq = httptest.NewRequest(http.MethodDelete, "/api/v2/groups/"+strconv.FormatInt(groupID, 10)+"/members/ght_alice_"+suffix, nil)
	removeReq.SetPathValue("groupID", strconv.FormatInt(groupID, 10))
	removeReq.SetPathValue("username", "ght_alice_"+suffix)
	removeReq.Header.Set("Authorization", "Bearer "+bobToken)
	removeRec = httptest.NewRecorder()
	server.auth(server.handleV2RemoveGroupMember)(removeRec, removeReq)
	if removeRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-admin remove member, got %d body=%s", removeRec.Code, removeRec.Body.String())
	}
}

func newGroupIntegrationServer(pool *pgxpool.Pool) *Server {
	jwtSvc := auth.NewJWTService("test-secret-that-is-at-least-32-bytes", time.Hour)
	sessions := session.NewManager()
	queries := sqlcgen.New(pool)
	return &Server{
		cfg: &config.Config{
			HeartbeatTimeout: time.Second,
		},
		sessions: sessions,
		jwtSvc:   jwtSvc,
		msgSvc:   appsvc.NewMessageService(queries, sessions),
		groupSvc: appsvc.NewGroupService(pool, queries, sessions),
	}
}

func newWebSocketTestServer() *Server {
	jwtSvc := auth.NewJWTService("test-secret-that-is-at-least-32-bytes", time.Hour)
	return &Server{
		cfg: &config.Config{
			HeartbeatTimeout: time.Second,
		},
		sessions: session.NewManager(),
		jwtSvc:   jwtSvc,
	}
}

func newWebSocketIntegrationServer(pool *pgxpool.Pool) *Server {
	jwtSvc := auth.NewJWTService("test-secret-that-is-at-least-32-bytes", time.Hour)
	sessions := session.NewManager()
	queries := sqlcgen.New(pool)
	return &Server{
		cfg: &config.Config{
			HeartbeatTimeout: time.Second,
		},
		sessions: sessions,
		jwtSvc:   jwtSvc,
		msgSvc:   appsvc.NewMessageService(queries, sessions),
	}
}

func newFileIntegrationServer(pool *pgxpool.Pool, uploadDir string) *Server {
	jwtSvc := auth.NewJWTService("test-secret-that-is-at-least-32-bytes", time.Hour)
	sessions := session.NewManager()
	queries := sqlcgen.New(pool)
	return &Server{
		cfg: &config.Config{
			HeartbeatTimeout: time.Second,
			UploadDir:        uploadDir,
			MaxFileSize:      8 * 1024 * 1024,
		},
		sessions: sessions,
		jwtSvc:   jwtSvc,
		msgSvc:   appsvc.NewMessageService(queries, sessions),
		fileSvc:  appsvc.NewFileService(pool, queries, sessions, uploadDir, 8*1024*1024),
		groupSvc: appsvc.NewGroupService(pool, queries, sessions),
	}
}

func signTestToken(t *testing.T, server *Server, userID int64, username, nickname string) string {
	t.Helper()
	token, err := server.jwtSvc.Sign(userID, username, nickname)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return token
}

func openTestWebSocket(t *testing.T, server *Server, token string) (net.Conn, *bufio.Reader) {
	t.Helper()

	clientConn, serverConn := net.Pipe()
	hijacker := newTestHijacker(serverConn)
	req := httptest.NewRequest(http.MethodGet, "/api/v2/ws?token="+url.QueryEscape(token), nil)
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")

	done := make(chan struct{})
	go func() {
		defer close(done)
		server.handleV2WebSocket(hijacker, req)
	}()
	t.Cleanup(func() {
		_ = clientConn.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatalf("websocket handler did not exit after client close")
		}
	})

	reader := bufio.NewReader(clientConn)
	resp, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatalf("read websocket handshake response: %v", err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 switching protocols, got %s", resp.Status)
	}
	return clientConn, reader
}

type testWebSocketClient struct {
	conn   net.Conn
	reader *bufio.Reader
}

func openTestWebSocketForUser(t *testing.T, server *Server, userID int64, username, nickname string) *testWebSocketClient {
	t.Helper()
	token := signTestToken(t, server, userID, username, nickname)
	conn, reader := openTestWebSocket(t, server, token)
	return &testWebSocketClient{conn: conn, reader: reader}
}

func (c *testWebSocketClient) close(t *testing.T) {
	t.Helper()
	_ = c.conn.Close()
}

func (c *testWebSocketClient) writeText(t *testing.T, payload string) {
	t.Helper()
	writeClientTextFrame(t, c.conn, payload)
}

func (c *testWebSocketClient) readReady(t *testing.T) protocolv2.Event[protocolv2.ReadyPayload] {
	t.Helper()
	var ready protocolv2.Event[protocolv2.ReadyPayload]
	readTestTextEvent(t, c.conn, c.reader, &ready)
	if ready.Event != "session.ready" {
		t.Fatalf("expected session.ready, got %q", ready.Event)
	}
	return ready
}

func (c *testWebSocketClient) readMessageEvent(t *testing.T, name string) protocolv2.Event[protocolv2.Message] {
	t.Helper()
	for range 10 {
		var envelope protocolv2.Event[json.RawMessage]
		readTestTextEvent(t, c.conn, c.reader, &envelope)
		if envelope.Event != name {
			continue
		}
		var message protocolv2.Message
		if err := json.Unmarshal(envelope.Payload, &message); err != nil {
			t.Fatalf("unmarshal %s payload: %v", name, err)
		}
		return protocolv2.Event[protocolv2.Message]{
			Event:     envelope.Event,
			RequestID: envelope.RequestID,
			Timestamp: envelope.Timestamp,
			Payload:   message,
		}
	}
	t.Fatalf("did not receive %s event", name)
	return protocolv2.Event[protocolv2.Message]{}
}

type testHijacker struct {
	header http.Header
	conn   net.Conn
	rw     *bufio.ReadWriter
}

func newTestHijacker(conn net.Conn) *testHijacker {
	return &testHijacker{
		header: make(http.Header),
		conn:   conn,
		rw: bufio.NewReadWriter(
			bufio.NewReader(conn),
			bufio.NewWriter(conn),
		),
	}
}

func (h *testHijacker) Header() http.Header {
	return h.header
}

func (h *testHijacker) Write([]byte) (int, error) {
	return 0, http.ErrHijacked
}

func (h *testHijacker) WriteHeader(int) {}

func (h *testHijacker) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return h.conn, h.rw, nil
}

func discardReadyEvent(t *testing.T, reader *bufio.Reader) {
	t.Helper()
	var ready protocolv2.Event[protocolv2.ReadyPayload]
	readTestTextEvent(t, nil, reader, &ready)
	if ready.Event != "session.ready" {
		t.Fatalf("expected initial session.ready, got %q", ready.Event)
	}
}

func readTestTextEvent(t *testing.T, conn net.Conn, reader *bufio.Reader, dst any) {
	t.Helper()

	if conn != nil {
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		defer conn.SetReadDeadline(time.Time{})
	}
	opcode, payload := readServerFrame(t, reader)
	if opcode != wsOpcodeText {
		t.Fatalf("expected text frame, got opcode %d", opcode)
	}
	if err := json.Unmarshal(payload, dst); err != nil {
		t.Fatalf("unmarshal websocket event %q: %v", string(payload), err)
	}
}

func insertHTTPTestUser(t *testing.T, pool *pgxpool.Pool, username, nickname string) int64 {
	t.Helper()

	passwordHash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}

	var userID int64
	if err := pool.QueryRow(context.Background(),
		`INSERT INTO users (username, password, nickname) VALUES ($1, $2, $3) RETURNING user_id`,
		username,
		passwordHash,
		nickname,
	).Scan(&userID); err != nil {
		t.Fatalf("insert test user %q: %v", username, err)
	}
	return userID
}

func containsHTTPMessage(messages []protocolv2.Message, messageID int64, content string) bool {
	for _, msg := range messages {
		if msg.MessageID == messageID && msg.Content == content {
			return true
		}
	}
	return false
}

func containsHTTPFileMessage(messages []protocolv2.Message, fileID int64, fileName string) bool {
	for _, msg := range messages {
		if msg.File != nil && msg.File.FileID == fileID && msg.File.FileName == fileName {
			return true
		}
	}
	return false
}

func uploadFileAs(t *testing.T, server *Server, userID int64, username, nickname, fileName, body, receiverUsername string) int64 {
	return uploadFileAsTarget(t, server, userID, username, nickname, fileName, body, receiverUsername, 0)
}

func uploadFileAsTarget(t *testing.T, server *Server, userID int64, username, nickname, fileName, body, receiverUsername string, groupID int64) int64 {
	t.Helper()

	token := signTestToken(t, server, userID, username, nickname)
	var payload strings.Builder
	writer := multipart.NewWriter(&payload)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := io.WriteString(part, body); err != nil {
		t.Fatalf("write multipart body: %v", err)
	}
	if receiverUsername != "" {
		if err := writer.WriteField("receiverUsername", receiverUsername); err != nil {
			t.Fatalf("write receiver username field: %v", err)
		}
	}
	if groupID > 0 {
		if err := writer.WriteField("groupID", strconv.FormatInt(groupID, 10)); err != nil {
			t.Fatalf("write group id field: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v2/files/upload", strings.NewReader(payload.String()))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()

	server.auth(server.handleV2Upload)(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 for upload, got %d body=%s", rec.Code, rec.Body.String())
	}

	var resp protocolv2.APIResponse[protocolv2.UploadResponse]
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal upload response: %v", err)
	}
	if resp.Data.File.FileID <= 0 || resp.Data.File.FileName != fileName {
		t.Fatalf("unexpected upload response: %#v", resp.Data.File)
	}
	return resp.Data.File.FileID
}

func downloadFileAs(t *testing.T, server *Server, userID int64, username, nickname string, fileID int64, wantStatus int) []byte {
	t.Helper()

	token := signTestToken(t, server, userID, username, nickname)
	req := httptest.NewRequest(http.MethodGet, "/api/v2/files/"+strconv.FormatInt(fileID, 10), nil)
	req.SetPathValue("fileID", strconv.FormatInt(fileID, 10))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	server.auth(server.handleV2Download)(rec, req)

	if rec.Code != wantStatus {
		t.Fatalf("expected download status %d, got %d body=%s", wantStatus, rec.Code, rec.Body.String())
	}
	return rec.Body.Bytes()
}

func uploadFileExpectStatus(t *testing.T, server *Server, userID int64, username, nickname, fileName, body, receiverUsername string, wantStatus int) {
	t.Helper()

	token := signTestToken(t, server, userID, username, nickname)
	var payload strings.Builder
	writer := multipart.NewWriter(&payload)
	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := io.WriteString(part, body); err != nil {
		t.Fatalf("write multipart body: %v", err)
	}
	if receiverUsername != "" {
		if err := writer.WriteField("receiverUsername", receiverUsername); err != nil {
			t.Fatalf("write receiver username field: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v2/files/upload", strings.NewReader(payload.String()))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	rec := httptest.NewRecorder()

	server.auth(server.handleV2Upload)(rec, req)

	if rec.Code != wantStatus {
		t.Fatalf("expected upload status %d, got %d body=%s", wantStatus, rec.Code, rec.Body.String())
	}
}

func downloadFileExpectStatus(t *testing.T, server *Server, userID int64, username, nickname string, fileID int64, wantStatus int) {
	t.Helper()

	token := signTestToken(t, server, userID, username, nickname)
	req := httptest.NewRequest(http.MethodGet, "/api/v2/files/"+strconv.FormatInt(fileID, 10), nil)
	req.SetPathValue("fileID", strconv.FormatInt(fileID, 10))
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	server.auth(server.handleV2Download)(rec, req)

	if rec.Code != wantStatus {
		t.Fatalf("expected download status %d, got %d body=%s", wantStatus, rec.Code, rec.Body.String())
	}
}

func waitForSessionGone(t *testing.T, sessions *session.Manager, username string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if sessions.Get(username) == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("session %q was not removed", username)
}

func readServerFrame(t *testing.T, reader *bufio.Reader) (byte, []byte) {
	t.Helper()

	header := make([]byte, 2)
	if _, err := io.ReadFull(reader, header); err != nil {
		t.Fatalf("read frame header: %v", err)
	}

	opcode := header[0] & 0x0F
	masked := header[1]&0x80 != 0
	if masked {
		t.Fatalf("server frames must not be masked")
	}

	payloadLen := int64(header[1] & 0x7F)
	switch payloadLen {
	case 126:
		extended := make([]byte, 2)
		if _, err := io.ReadFull(reader, extended); err != nil {
			t.Fatalf("read extended payload length: %v", err)
		}
		payloadLen = int64(binary.BigEndian.Uint16(extended))
	case 127:
		extended := make([]byte, 8)
		if _, err := io.ReadFull(reader, extended); err != nil {
			t.Fatalf("read extended payload length: %v", err)
		}
		payloadLen = int64(binary.BigEndian.Uint64(extended))
	}

	payload := make([]byte, payloadLen)
	if _, err := io.ReadFull(reader, payload); err != nil {
		t.Fatalf("read frame payload: %v", err)
	}
	return opcode, payload
}

func writeClientTextFrame(t *testing.T, conn net.Conn, payload string) {
	t.Helper()
	writeClientFrame(t, conn, wsOpcodeText, []byte(payload))
}

func writeClientFrame(t *testing.T, conn net.Conn, opcode byte, payload []byte) {
	t.Helper()

	var header [14]byte
	header[0] = 0x80 | opcode
	n := 2

	switch l := len(payload); {
	case l <= 125:
		header[1] = 0x80 | byte(l)
	case l <= 65535:
		header[1] = 0x80 | 126
		binary.BigEndian.PutUint16(header[2:4], uint16(l))
		n = 4
	default:
		header[1] = 0x80 | 127
		binary.BigEndian.PutUint64(header[2:10], uint64(l))
		n = 10
	}

	maskOffset := n
	maskKey := [4]byte{0x11, 0x22, 0x33, 0x44}
	copy(header[maskOffset:maskOffset+4], maskKey[:])
	n += 4

	maskedPayload := append([]byte(nil), payload...)
	for i := range maskedPayload {
		maskedPayload[i] ^= maskKey[i%4]
	}

	if _, err := conn.Write(header[:n]); err != nil {
		t.Fatalf("write frame header: %v", err)
	}
	if _, err := conn.Write(maskedPayload); err != nil {
		t.Fatalf("write frame payload: %v", err)
	}
}
