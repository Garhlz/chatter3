// Package http provides the HTTP server for the v2 API.
//
// Route map:
//
//	POST /api/v2/auth/register       — create account
//	POST /api/v2/auth/login          — get JWT
//	GET  /api/v2/users/online        — list online users  [auth required]
//	GET  /api/v2/chats/public/history         [auth required]
//	GET  /api/v2/chats/private/{username}/history  [auth required]
//	GET  /api/v2/ws                  — WebSocket upgrade  [auth via ?token=]
//	POST /api/v2/files/upload        [501 until P6]
//	GET  /api/v2/files/{fileID}      [501 until P6]
package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter2/backend-go/internal/auth"
	"github.com/elaine/chatter2/backend-go/internal/config"
	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
	"github.com/elaine/chatter2/backend-go/internal/repository/sqlcgen"
	appsvc "github.com/elaine/chatter2/backend-go/internal/service"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

// contextKey is a private type for context values to avoid collisions.
type contextKey int

const claimsKey contextKey = iota

// Server encapsulates the HTTP server and all its dependencies.
type Server struct {
	cfg      *config.Config
	server   *http.Server
	sessions *session.Manager
	jwtSvc   *auth.JWTService
	userSvc  *appsvc.UserService
	msgSvc   *appsvc.MessageService
	fileSvc  *appsvc.FileService
	groupSvc *appsvc.GroupService
}

// NewServer wires up all routes and dependencies.
func NewServer(
	cfg *config.Config,
	pool *pgxpool.Pool,
	sessions *session.Manager,
) *Server {
	// Build the dependency chain: repo -> service -> handler.
	// All layers are constructed here so handlers stay thin.
	//
	// 这样做是为了让 server.go 明确承担“装配根”的职责：
	// - repository 只管数据读写
	// - service 只管业务规则与协议装配
	// - handler 只管 HTTP 输入输出
	//
	// 对当前阶段来说，这种拆分比“先追求目录绝对优雅”更重要，
	// 因为它能直接降低后续接 WebSocket 时的改造成本。
	jwtSvc := auth.NewJWTService(cfg.JWTSecret, cfg.JWTExpiration)

	queries := sqlcgen.New(pool)

	userSvc := appsvc.NewUserService(queries, jwtSvc, sessions)
	msgSvc := appsvc.NewMessageService(queries, sessions)
	fileSvc := appsvc.NewFileService(pool, queries, sessions, cfg.UploadDir, cfg.MaxFileSize)
	groupSvc := appsvc.NewGroupService(pool, queries, sessions)

	s := &Server{
		cfg:      cfg,
		sessions: sessions,
		jwtSvc:   jwtSvc,
		userSvc:  userSvc,
		msgSvc:   msgSvc,
		fileSvc:  fileSvc,
		groupSvc: groupSvc,
	}

	mux := http.NewServeMux()

	// Health check — no auth required.
	mux.HandleFunc("GET /health", s.handleHealth)

	// v2 auth — no auth required (these are how you get a token).
	mux.HandleFunc("POST /api/v2/auth/register", s.handleV2Register)
	mux.HandleFunc("POST /api/v2/auth/login", s.handleV2Login)

	// v2 protected endpoints — all require a valid Bearer token.
	mux.HandleFunc("GET /api/v2/users/online", s.auth(s.handleV2OnlineUsers))
	mux.HandleFunc("GET /api/v2/users/{username}/profile", s.auth(s.handleV2GetProfile))
	mux.HandleFunc("PUT /api/v2/users/{username}/profile", s.auth(s.handleV2UpdateProfile))
	mux.HandleFunc("GET /api/v2/chats/public/history", s.auth(s.handleV2PublicHistory))
	mux.HandleFunc("GET /api/v2/chats/private/{username}/history", s.auth(s.handleV2PrivateHistory))

	// WebSocket — auth via ?token= query param (browsers can't set headers on WS).
	mux.HandleFunc("GET /api/v2/ws", s.handleV2WebSocket)

	// File endpoints — auth required.
	mux.HandleFunc("POST /api/v2/files/upload", s.auth(s.handleV2Upload))
	mux.HandleFunc("GET /api/v2/files/{fileID}", s.auth(s.handleV2Download))

	// Group endpoints — all require auth.
	mux.HandleFunc("POST /api/v2/groups", s.auth(s.handleV2CreateGroup))
	mux.HandleFunc("GET /api/v2/groups", s.auth(s.handleV2ListGroups))
	mux.HandleFunc("GET /api/v2/groups/{groupID}", s.auth(s.handleV2GetGroup))
	mux.HandleFunc("GET /api/v2/groups/{groupID}/members", s.auth(s.handleV2GroupMembers))
	mux.HandleFunc("POST /api/v2/groups/{groupID}/members", s.auth(s.handleV2AddGroupMembers))
	mux.HandleFunc("DELETE /api/v2/groups/{groupID}/members/{username}", s.auth(s.handleV2RemoveGroupMember))
	mux.HandleFunc("GET /api/v2/groups/{groupID}/history", s.auth(s.handleV2GroupHistory))

	s.server = &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.HTTPPort),
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
		BaseContext: func(l net.Listener) context.Context {
			return context.Background()
		},
	}
	return s
}

// Run starts the HTTP server. It shuts down gracefully when ctx is cancelled.
func (s *Server) Run(ctx context.Context) error {
	slog.Info("HTTP 服务器已启动", "addr", s.server.Addr)

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.server.Shutdown(shutCtx)
	}()

	go s.reapIdleSessions(ctx)

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("HTTP 服务器异常退出: %w", err)
	}
	return nil
}

func (s *Server) reapIdleSessions(ctx context.Context) {
	interval := s.cfg.HeartbeatTimeout / 2
	if interval <= 0 {
		interval = 30 * time.Second
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			expired := s.sessions.ExpireIdleSessions(now, s.cfg.HeartbeatTimeout)
			for _, sess := range expired {
				sess.Shutdown()
				s.sessions.Broadcast(eventJSON("presence.offline", "", protocolv2.PresencePayload{
					User: protocolv2.User{
						UserID:   sess.UserID,
						Username: sess.Username,
						Nickname: sess.Nickname,
						Online:   false,
					},
				}), sess.Username)
				slog.Info("session expired by heartbeat timeout", "username", sess.Username)
			}
		}
	}
}

// --- Auth middleware ---

// auth wraps a handler and requires a valid Bearer token in the Authorization header.
// On success it injects the parsed *auth.Claims into the request context.
func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "unauthorized", "missing or invalid Authorization header")
			return
		}
		claims, err := s.jwtSvc.Verify(header[len("Bearer "):])
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "token is invalid or expired")
			return
		}
		// 当前 HTTP 路由通过 request context 传递认证身份。
		// 这样 handler 不需要重新解析 token，也避免把 user identity 继续以字符串参数层层透传。
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next(w, r.WithContext(ctx))
	}
}

// claimsFrom extracts the JWT claims injected by the auth middleware.
// Panics if called outside an auth-wrapped handler.
func claimsFrom(r *http.Request) *auth.Claims {
	return r.Context().Value(claimsKey).(*auth.Claims)
}

// --- Handlers ---

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleV2Register creates a new user account.
// No auth required — this is the first step for a new user.
func (s *Server) handleV2Register(w http.ResponseWriter, r *http.Request) {
	var req protocolv2.RegisterRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	user, err := s.userSvc.Register(r.Context(), req.Username, req.Password, req.Nickname)
	if errors.Is(err, appsvc.ErrUsernameTaken) {
		writeError(w, http.StatusConflict, "username_taken", "username is already in use")
		return
	}
	if err != nil {
		slog.Error("register failed", "err", err)
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, protocolv2.APIResponse[protocolv2.RegisterResponse]{
		Data: protocolv2.RegisterResponse{User: *user},
	})
}

// handleV2Login verifies credentials and returns a JWT.
// The token is then used for all subsequent HTTP and WebSocket requests.
func (s *Server) handleV2Login(w http.ResponseWriter, r *http.Request) {
	var req protocolv2.LoginRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	token, user, err := s.userSvc.Login(r.Context(), req.Username, req.Password)
	if errors.Is(err, appsvc.ErrInvalidCredentials) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "invalid username or password")
		return
	}
	if err != nil {
		slog.Error("login failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "login failed")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[protocolv2.LoginResponse]{
		Data: protocolv2.LoginResponse{Token: token, User: *user},
	})
}

// handleV2OnlineUsers returns the list of currently connected users.
// 当前实现仍然依赖 session.Manager 的内存态。
//
// 这也是为什么 TODO 里已经把“真实在线状态语义”放进 P3：
// 只有当 WebSocket 常驻连接接通后，这个列表才会真正有稳定意义。
func (s *Server) handleV2OnlineUsers(w http.ResponseWriter, r *http.Request) {
	snapshots := s.sessions.OnlineSnapshots()

	users := make([]protocolv2.User, 0, len(snapshots))
	for _, sess := range snapshots {
		users = append(users, protocolv2.User{
			UserID:   sess.UserID,
			Username: sess.Username,
			Nickname: sess.Nickname,
			Online:   sess.Online,
		})
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[[]protocolv2.User]{Data: users})
}

// handleV2GetProfile returns a user's public profile.
func (s *Server) handleV2GetProfile(w http.ResponseWriter, r *http.Request) {
	username := r.PathValue("username")
	claims := claimsFrom(r)
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token required")
		return
	}
	profile, err := s.userSvc.GetUserProfile(r.Context(), username, claims.UserID)
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, protocolv2.APIResponse[*protocolv2.OwnProfile]{Data: profile})
}

// handleV2UpdateProfile updates the calling user's own profile.
func (s *Server) handleV2UpdateProfile(w http.ResponseWriter, r *http.Request) {
	username := r.PathValue("username")
	claims := claimsFrom(r)
	if claims == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token required")
		return
	}
	if claims.Username != username {
		writeError(w, http.StatusForbidden, "forbidden", "can only update your own profile")
		return
	}
	var req protocolv2.UpdateProfileRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	profile, err := s.userSvc.UpdateUserProfile(r.Context(), claims.UserID, &req)
	if err != nil {
		if errors.Is(err, appsvc.ErrInvalidProfileInput) {
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal_error", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, protocolv2.APIResponse[*protocolv2.OwnProfile]{Data: profile})
}

// handleV2PublicHistory returns a cursor-paginated page of lobby messages.
// Query params: limit (int, default 50), cursor (string, opaque).
func (s *Server) handleV2PublicHistory(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	cursor := r.URL.Query().Get("cursor")

	msgs, nextCursor, err := s.msgSvc.GetPublicHistory(r.Context(), cursor, limit)
	if errors.Is(err, appsvc.ErrInvalidCursor) {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err != nil {
		slog.Error("public history failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load history")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.CursorResponse[protocolv2.Message]{
		Data:       msgs,
		NextCursor: nextCursor,
	})
}

// handleV2PrivateHistory returns a cursor-paginated page of messages between
// the authenticated user and the user named in the URL path.
func (s *Server) handleV2PrivateHistory(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	otherUsername := r.PathValue("username")
	if otherUsername == "" {
		writeError(w, http.StatusBadRequest, "bad_request", "username is required")
		return
	}

	limit := queryInt(r, "limit", 50)
	cursor := r.URL.Query().Get("cursor")

	msgs, nextCursor, err := s.msgSvc.GetPrivateHistory(r.Context(), claims.UserID, otherUsername, cursor, limit)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	if errors.Is(err, appsvc.ErrInvalidCursor) || errors.Is(err, appsvc.ErrReceiverRequired) {
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	if err != nil {
		slog.Error("private history failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load history")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.CursorResponse[protocolv2.Message]{
		Data:       msgs,
		NextCursor: nextCursor,
	})
}

func (s *Server) handleV2WebSocket(w http.ResponseWriter, r *http.Request) {
	// WebSocket auth uses ?token= because browsers cannot set custom headers
	// during the initial WebSocket handshake.
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token query param required")
		return
	}
	claims, err := s.jwtSvc.Verify(tokenStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token is invalid or expired")
		return
	}
	identity := &protocolv2.User{
		UserID:   claims.UserID,
		Username: claims.Username,
		Nickname: claims.Nickname,
	}
	if s.userSvc != nil {
		identity, err = s.userSvc.GetIdentity(r.Context(), claims.UserID)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "token is invalid or expired")
			return
		}
	}

	ws, err := acceptWebSocket(w, r)
	if err != nil {
		slog.Warn("websocket upgrade failed", "err", err)
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	}
	defer ws.close()

	sess := &session.Session{
		UserID:        identity.UserID,
		Username:      identity.Username,
		Nickname:      identity.Nickname,
		LastHeartbeat: time.Now(),
		Close:         ws.close,
		Send:          make(chan []byte, 32),
	}

	s.sessions.Register(sess)
	// 上线通知只发给其他会话，避免自己收到一条“自己刚上线”的冗余事件。
	s.sessions.Broadcast(eventJSON("presence.online", "", protocolv2.PresencePayload{
		User: protocolv2.User{
			UserID:   sess.UserID,
			Username: sess.Username,
			Nickname: sess.Nickname,
			Online:   true,
		},
	}), sess.Username)
	defer func() {
		// 先把会话从 manager 移除，再关闭 send channel。
		// 否则其他 goroutine 仍可能通过 manager 找到这个 session，
		// 向已关闭的 channel 发送数据并触发 panic。
		s.sessions.RemoveSession(sess)
		sess.Shutdown()
		s.sessions.Broadcast(eventJSON("presence.offline", "", protocolv2.PresencePayload{
			User: protocolv2.User{
				UserID:   sess.UserID,
				Username: sess.Username,
				Nickname: sess.Nickname,
				Online:   false,
			},
		}), sess.Username)
	}()

	if err := ws.writeJSON(protocolv2.Event[protocolv2.ReadyPayload]{
		Event:     "session.ready",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload: protocolv2.ReadyPayload{
			User: protocolv2.User{
				UserID:   sess.UserID,
				Username: sess.Username,
				Nickname: sess.Nickname,
				Online:   true,
			},
			HeartbeatTimeout: s.cfg.HeartbeatTimeout.String(),
		},
	}); err != nil {
		slog.Warn("websocket ready write failed", "user", sess.Username, "err", err)
		return
	}

	go func() {
		for msg := range sess.Send {
			if err := ws.writeFrame(wsOpcodeText, msg); err != nil {
				return
			}
		}
	}()

	for {
		_ = ws.setReadDeadline(time.Now().Add(s.cfg.HeartbeatTimeout))
		opcode, payload, err := ws.readFrame()
		if err != nil {
			if !errors.Is(err, io.EOF) {
				slog.Debug("websocket read ended", "user", sess.Username, "err", err)
			}
			return
		}

		switch opcode {
		case wsOpcodeClose:
			_ = ws.writeFrame(wsOpcodeClose, nil)
			return
		case wsOpcodePing:
			if err := ws.writeFrame(wsOpcodePong, payload); err != nil {
				return
			}
		case wsOpcodePong:
			s.sessions.UpdateHeartbeat(sess.Username)
		case wsOpcodeText:
			var in wsInboundEvent
			if err := json.Unmarshal(payload, &in); err != nil {
				_ = ws.writeFrame(wsOpcodeText, errorEventJSON("bad_request", "invalid websocket JSON payload", ""))
				continue
			}

			switch in.Event {
			case "session.ping":
				s.sessions.UpdateHeartbeat(sess.Username)
				if err := ws.writeJSON(protocolv2.Event[protocolv2.PongPayload]{
					Event:     "session.pong",
					RequestID: in.RequestID,
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Payload:   protocolv2.PongPayload{},
				}); err != nil {
					return
				}
			case "chat.public.send":
				var payload protocolv2.PublicSendPayload
				if err := json.Unmarshal(in.Payload, &payload); err != nil {
					_ = ws.writeFrame(wsOpcodeText, errorEventJSON("bad_request", "invalid public chat payload", in.RequestID))
					continue
				}

				msg, err := s.msgSvc.CreatePublicMessage(r.Context(), sess, payload.Content)
				if err != nil {
					_ = ws.writeFrame(wsOpcodeText, messageErrorEventJSON(err, in.RequestID))
					continue
				}
				s.sessions.Broadcast(eventJSON("chat.public.message", in.RequestID, msg), "")
			case "chat.private.send":
				var payload protocolv2.PrivateSendPayload
				if err := json.Unmarshal(in.Payload, &payload); err != nil {
					_ = ws.writeFrame(wsOpcodeText, errorEventJSON("bad_request", "invalid private chat payload", in.RequestID))
					continue
				}

				receiverUsername, msg, err := s.msgSvc.CreatePrivateMessage(r.Context(), sess, payload.ReceiverUsername, payload.Content)
				if err != nil {
					_ = ws.writeFrame(wsOpcodeText, messageErrorEventJSON(err, in.RequestID))
					continue
				}

				body := eventJSON("chat.private.message", in.RequestID, msg)
				_ = s.sessions.Send(receiverUsername, body)
				_ = s.sessions.Send(sess.Username, body)

			case "chat.group.send":
				var payload protocolv2.GroupSendPayload
				if err := json.Unmarshal(in.Payload, &payload); err != nil {
					_ = ws.writeFrame(wsOpcodeText, errorEventJSON("bad_request", "invalid group chat payload", in.RequestID))
					continue
				}

				msg, memberUsernames, err := s.groupSvc.SendGroupMessage(r.Context(), sess, payload.GroupID, payload.Content)
				if err != nil {
					_ = ws.writeFrame(wsOpcodeText, messageErrorEventJSON(err, in.RequestID))
					continue
				}

				body := eventJSON("chat.group.message", in.RequestID, msg)
				s.sessions.SendToUsers(body, memberUsernames)
			default:
				_ = ws.writeFrame(wsOpcodeText, errorEventJSON("not_implemented", "websocket event is not implemented yet", in.RequestID))
			}
		default:
			_ = ws.writeFrame(wsOpcodeText, errorEventJSON("bad_request", "unsupported websocket opcode", ""))
		}
	}
}

func (s *Server) handleV2Upload(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	identity, err := s.userSvc.GetIdentity(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token is invalid or expired")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxFileSize+(1<<20))
	if err := r.ParseMultipartForm(s.cfg.MaxFileSize + (1 << 20)); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "file is too large")
			return
		}
		writeError(w, http.StatusBadRequest, "bad_request", "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "file is required")
		return
	}
	defer file.Close()

	result, err := s.fileSvc.SaveUpload(r.Context(), appsvc.FileUploadInput{
		SenderID:         identity.UserID,
		SenderUsername:   identity.Username,
		SenderNickname:   identity.Nickname,
		ReceiverUsername: r.FormValue("receiverUsername"),
		FileName:         header.Filename,
		MIMEType:         header.Header.Get("Content-Type"),
		Size:             header.Size,
		Reader:           file,
	})
	if err != nil {
		switch {
		case errors.Is(err, appsvc.ErrFileRequired),
			errors.Is(err, appsvc.ErrReceiverRequired),
			errors.Is(err, appsvc.ErrCannotMessageSelf):
			writeError(w, http.StatusBadRequest, "bad_request", err.Error())
			return
		case errors.Is(err, appsvc.ErrFileTooLarge):
			writeError(w, http.StatusRequestEntityTooLarge, "payload_too_large", "file is too large")
			return
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found", "user not found")
			return
		default:
			slog.Error("file upload failed", "err", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "file upload failed")
			return
		}
	}

	if result.ReceiverUsername == "" {
		s.sessions.Broadcast(eventJSON("chat.public.message", "", result.Message), "")
	} else {
		body := eventJSON("chat.private.message", "", result.Message)
		_ = s.sessions.Send(result.ReceiverUsername, body)
		_ = s.sessions.Send(identity.Username, body)
	}

	writeJSON(w, http.StatusCreated, protocolv2.APIResponse[protocolv2.UploadResponse]{
		Data: protocolv2.UploadResponse{File: result.File},
	})
}

func (s *Server) handleV2Download(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	fileID, err := strconv.ParseInt(r.PathValue("fileID"), 10, 64)
	if err != nil || fileID <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid file id")
		return
	}

	download, err := s.fileSvc.GetDownload(r.Context(), claims.UserID, fileID)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "file not found")
		return
	}
	if errors.Is(err, appsvc.ErrForbiddenFile) {
		writeError(w, http.StatusForbidden, "forbidden", "file access denied")
		return
	}
	if err != nil {
		slog.Error("file download lookup failed", "file_id", fileID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "file lookup failed")
		return
	}

	fd, err := os.Open(download.Path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusNotFound, "not_found", "file content not found")
			return
		}
		slog.Error("file open failed", "file_id", fileID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "file open failed")
		return
	}
	defer fd.Close()

	stat, err := fd.Stat()
	if err != nil {
		slog.Error("file stat failed", "file_id", fileID, "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "file stat failed")
		return
	}

	contentType := download.MIMEType
	if contentType == "" {
		contentType = mime.TypeByExtension(strings.ToLower(filepath.Ext(download.FileName)))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", download.FileName))
	http.ServeContent(w, r, download.FileName, stat.ModTime(), fd)
}

func (s *Server) handleV2CreateGroup(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	identity, err := s.userSvc.GetIdentity(r.Context(), claims.UserID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token is invalid or expired")
		return
	}
	var req protocolv2.CreateGroupRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	group, err := s.groupSvc.CreateGroup(r.Context(), identity.UserID, identity.Username, identity.Nickname, req.GroupName, req.Members)
	switch {
	case errors.Is(err, appsvc.ErrGroupNameRequired) || errors.Is(err, appsvc.ErrGroupNameTooLong):
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	case errors.Is(err, appsvc.ErrMemberNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	case err != nil:
		slog.Error("create group failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to create group")
		return
	}

	writeJSON(w, http.StatusCreated, protocolv2.APIResponse[protocolv2.CreateGroupResponse]{
		Data: protocolv2.CreateGroupResponse{Group: *group},
	})
}

func (s *Server) handleV2ListGroups(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)

	groups, err := s.groupSvc.GetUserGroups(r.Context(), claims.UserID)
	if err != nil {
		slog.Error("list groups failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to list groups")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[[]protocolv2.Group]{Data: groups})
}

func (s *Server) handleV2GetGroup(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	groupID, err := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	if err != nil || groupID <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid group id")
		return
	}

	group, err := s.groupSvc.GetGroupByIDForUser(r.Context(), claims.UserID, groupID)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "group not found")
		return
	}
	if errors.Is(err, appsvc.ErrNotGroupMember) {
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
		return
	}
	if err != nil {
		slog.Error("get group failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to get group")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[protocolv2.Group]{Data: *group})
}

func (s *Server) handleV2GroupMembers(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	groupID, err := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	if err != nil || groupID <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid group id")
		return
	}

	members, err := s.groupSvc.GetGroupMembersForUser(r.Context(), claims.UserID, groupID)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "group not found")
		return
	}
	if errors.Is(err, appsvc.ErrNotGroupMember) {
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
		return
	}
	if err != nil {
		slog.Error("get group members failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to get members")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[[]protocolv2.GroupMember]{Data: members})
}

func (s *Server) handleV2AddGroupMembers(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	groupID, err := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	if err != nil || groupID <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid group id")
		return
	}

	var req protocolv2.AddGroupMemberRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	members, err := s.groupSvc.AddMembers(r.Context(), claims.UserID, groupID, req.Usernames)
	switch {
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "group not found")
		return
	case errors.Is(err, appsvc.ErrNotGroupAdmin):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
		return
	case errors.Is(err, appsvc.ErrMemberNotFound):
		writeError(w, http.StatusNotFound, "not_found", err.Error())
		return
	case err != nil:
		slog.Error("add group members failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to add members")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[[]protocolv2.GroupMember]{Data: members})
}

func (s *Server) handleV2RemoveGroupMember(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	groupID, err := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	if err != nil || groupID <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid group id")
		return
	}

	targetUsername := r.PathValue("username")
	if err := s.groupSvc.RemoveMember(r.Context(), claims.UserID, groupID, targetUsername); err != nil {
		switch {
		case errors.Is(err, repository.ErrNotFound):
			writeError(w, http.StatusNotFound, "not_found", "user not found")
			return
		case errors.Is(err, appsvc.ErrNotGroupAdmin):
			writeError(w, http.StatusForbidden, "forbidden", err.Error())
			return
		case errors.Is(err, appsvc.ErrMemberNotFound):
			writeError(w, http.StatusNotFound, "not_found", "member not found in group")
			return
		case errors.Is(err, appsvc.ErrCannotRemoveOwner):
			writeError(w, http.StatusForbidden, "forbidden", err.Error())
			return
		default:
			slog.Error("remove group member failed", "err", err)
			writeError(w, http.StatusInternalServerError, "internal_error", "failed to remove member")
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleV2GroupHistory(w http.ResponseWriter, r *http.Request) {
	claims := claimsFrom(r)
	groupID, err := strconv.ParseInt(r.PathValue("groupID"), 10, 64)
	if err != nil || groupID <= 0 {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid group id")
		return
	}

	limit := queryInt(r, "limit", 50)
	cursor := r.URL.Query().Get("cursor")

	msgs, nextCursor, err := s.groupSvc.GetGroupHistory(r.Context(), claims.UserID, groupID, cursor, limit)
	switch {
	case errors.Is(err, repository.ErrNotFound):
		writeError(w, http.StatusNotFound, "not_found", "group not found")
		return
	case errors.Is(err, appsvc.ErrNotGroupMember):
		writeError(w, http.StatusForbidden, "forbidden", err.Error())
		return
	case errors.Is(err, appsvc.ErrInvalidCursor):
		writeError(w, http.StatusBadRequest, "bad_request", err.Error())
		return
	case err != nil:
		slog.Error("group history failed", "err", err)
		writeError(w, http.StatusInternalServerError, "internal_error", "failed to load group history")
		return
	}

	writeJSON(w, http.StatusOK, protocolv2.CursorResponse[protocolv2.Message]{
		Data:       msgs,
		NextCursor: nextCursor,
	})
}

// --- Helpers ---

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("HTTP JSON 响应写入失败", "err", err)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, protocolv2.APIErrorResponse{
		Error: protocolv2.ErrorBody{Code: code, Message: message},
	})
}

func writeNotImplemented(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusNotImplemented, protocolv2.APIErrorResponse{
		Error: protocolv2.ErrorBody{Code: "not_implemented", Message: msg},
	})
}

func messageErrorCode(err error) string {
	switch {
	case errors.Is(err, appsvc.ErrContentTooLong):
		return "payload_too_large"
	case errors.Is(err, repository.ErrNotFound):
		return "not_found"
	case errors.Is(err, appsvc.ErrNotGroupMember):
		return "forbidden"
	case errors.Is(err, appsvc.ErrContentRequired),
		errors.Is(err, appsvc.ErrReceiverRequired),
		errors.Is(err, appsvc.ErrCannotMessageSelf),
		errors.Is(err, appsvc.ErrInvalidCursor):
		return "bad_request"
	default:
		return "internal_error"
	}
}

func messageErrorEventJSON(err error, requestID string) []byte {
	code := messageErrorCode(err)
	message := err.Error()
	if code == "internal_error" {
		message = "message operation failed"
	}
	return errorEventJSON(code, message, requestID)
}

// decodeJSON decodes r.Body into dst. Returns false and writes a 400 if it fails.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, "bad_request", "invalid JSON: "+err.Error())
		return false
	}
	return true
}

// queryInt reads an integer query parameter, returning defaultVal if absent or invalid.
func queryInt(r *http.Request, name string, defaultVal int) int {
	s := r.URL.Query().Get(name)
	if s == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 {
		return defaultVal
	}
	return n
}
