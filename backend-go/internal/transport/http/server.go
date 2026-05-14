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
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/elaine/chatter2/backend-go/internal/auth"
	"github.com/elaine/chatter2/backend-go/internal/config"
	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
	usersvc "github.com/elaine/chatter2/backend-go/internal/service"
	"github.com/elaine/chatter2/backend-go/internal/session"
	"github.com/elaine/chatter2/backend-go/internal/storage"
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
	userSvc  *usersvc.UserService
	msgSvc   *MessageService
	userRepo *repository.UserRepository
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

	userRepo := repository.NewUserRepository(pool)
	msgRepo := storage.NewMessageRepository(pool)

	userSvc := usersvc.NewUserService(userRepo, jwtSvc)
	msgSvc := newMessageService(msgRepo, sessions)

	s := &Server{
		cfg:      cfg,
		sessions: sessions,
		jwtSvc:   jwtSvc,
		userSvc:  userSvc,
		msgSvc:   msgSvc,
		userRepo: userRepo,
	}

	mux := http.NewServeMux()

	// Health check — no auth required.
	mux.HandleFunc("GET /health", s.handleHealth)

	// v2 auth — no auth required (these are how you get a token).
	mux.HandleFunc("POST /api/v2/auth/register", s.handleV2Register)
	mux.HandleFunc("POST /api/v2/auth/login", s.handleV2Login)

	// v2 protected endpoints — all require a valid Bearer token.
	mux.HandleFunc("GET /api/v2/users/online", s.auth(s.handleV2OnlineUsers))
	mux.HandleFunc("GET /api/v2/chats/public/history", s.auth(s.handleV2PublicHistory))
	mux.HandleFunc("GET /api/v2/chats/private/{username}/history", s.auth(s.handleV2PrivateHistory))

	// WebSocket — auth via ?token= query param (browsers can't set headers on WS).
	mux.HandleFunc("GET /api/v2/ws", s.handleV2WebSocket)

	// File endpoints — deferred to P6.
	mux.HandleFunc("POST /api/v2/files/upload", s.handleV2Upload)
	mux.HandleFunc("GET /api/v2/files/{fileID}", s.handleV2Download)

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

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("HTTP 服务器异常退出: %w", err)
	}
	return nil
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
	if errors.Is(err, usersvc.ErrUsernameTaken) {
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
	if errors.Is(err, usersvc.ErrInvalidCredentials) {
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
	names := s.sessions.OnlineUsernames()

	users := make([]protocolv2.User, 0, len(names))
	for _, name := range names {
		sess := s.sessions.Get(name)
		if sess == nil {
			continue
		}
		users = append(users, protocolv2.User{
			UserID:   sess.UserID,
			Username: sess.Username,
			Nickname: sess.Nickname,
			Online:   true,
		})
	}

	writeJSON(w, http.StatusOK, protocolv2.APIResponse[[]protocolv2.User]{Data: users})
}

// handleV2PublicHistory returns a cursor-paginated page of lobby messages.
// Query params: limit (int, default 50), cursor (string, opaque).
func (s *Server) handleV2PublicHistory(w http.ResponseWriter, r *http.Request) {
	limit := queryInt(r, "limit", 50)
	cursor := r.URL.Query().Get("cursor")

	msgs, nextCursor, err := s.msgSvc.GetPublicHistory(r.Context(), cursor, limit)
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

	// Look up the other user's ID — needed for the two-party query.
	otherUser, err := s.userRepo.GetByUsername(r.Context(), otherUsername)
	if errors.Is(err, repository.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal_error", "lookup failed")
		return
	}

	limit := queryInt(r, "limit", 50)
	beforeID := int64(0)
	if c := r.URL.Query().Get("cursor"); c != "" {
		if parsed, err := strconv.ParseInt(c, 10, 64); err == nil {
			beforeID = parsed
		}
	}

	msgs, nextCursor, err := s.msgSvc.GetPrivateHistoryByIDs(
		r.Context(), claims.UserID, otherUser.UserID, beforeID, limit,
	)
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
	//
	// 当前这里只做“握手前认证入口”的占位说明，不进入真正事件循环。
	// 这样前端和后端都能先围绕固定入口开发，而不会因为 ws 路由名反复变化而来回改代码。
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token query param required")
		return
	}
	_, err := s.jwtSvc.Verify(tokenStr)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "token is invalid or expired")
		return
	}
	// Full WebSocket event loop is implemented in P3.
	writeNotImplemented(w, "websocket event loop will be implemented in P3")
}

func (s *Server) handleV2Upload(w http.ResponseWriter, _ *http.Request) {
	writeNotImplemented(w, "file upload will be implemented in P6")
}

func (s *Server) handleV2Download(w http.ResponseWriter, _ *http.Request) {
	writeNotImplemented(w, "file download will be implemented in P6")
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
