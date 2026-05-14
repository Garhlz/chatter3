package http

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/elaine/chatter2/backend-go/internal/config"
	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
)

// Server 封装 HTTP 服务，提供健康检查和文件上传下载端点。
type Server struct {
	cfg    *config.Config
	server *http.Server
}

func NewServer(cfg *config.Config) *Server {
	mux := http.NewServeMux()
	s := &Server{cfg: cfg}

	mux.HandleFunc("GET /health", s.handleHealth)
	// v1 兼容占位
	mux.HandleFunc("POST /api/files/upload", s.handleUpload)
	mux.HandleFunc("GET /api/files/download/{storedFileName}", s.handleDownload)
	// v2 契约占位
	mux.HandleFunc("POST /api/v2/auth/register", s.handleV2Register)
	mux.HandleFunc("POST /api/v2/auth/login", s.handleV2Login)
	mux.HandleFunc("GET /api/v2/users/online", s.handleV2OnlineUsers)
	mux.HandleFunc("GET /api/v2/chats/public/history", s.handleV2PublicHistory)
	mux.HandleFunc("GET /api/v2/chats/private/{username}/history", s.handleV2PrivateHistory)
	mux.HandleFunc("POST /api/v2/files/upload", s.handleV2Upload)
	mux.HandleFunc("GET /api/v2/files/{fileID}", s.handleV2Download)
	mux.HandleFunc("GET /api/v2/ws", s.handleV2WebSocket)

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

// Run 启动 HTTP 服务，ctx 取消时优雅关闭。
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

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleUpload 和 handleDownload 在 P7 实现，此处返回 501。
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "legacy file upload endpoint is not implemented yet")
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "legacy file download endpoint is not implemented yet")
}

func (s *Server) handleV2Register(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 register endpoint scaffolded but not implemented")
}

func (s *Server) handleV2Login(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 login endpoint scaffolded but not implemented")
}

func (s *Server) handleV2OnlineUsers(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 online users endpoint scaffolded but not implemented")
}

func (s *Server) handleV2PublicHistory(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 public history endpoint scaffolded but not implemented")
}

func (s *Server) handleV2PrivateHistory(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 private history endpoint scaffolded but not implemented")
}

func (s *Server) handleV2Upload(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 file upload endpoint scaffolded but not implemented")
}

func (s *Server) handleV2Download(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 file download endpoint scaffolded but not implemented")
}

func (s *Server) handleV2WebSocket(w http.ResponseWriter, r *http.Request) {
	writeNotImplemented(w, r, "v2 websocket endpoint scaffolded but not implemented")
}

func writeNotImplemented(w http.ResponseWriter, r *http.Request, msg string) {
	writeJSON(w, http.StatusNotImplemented, protocolv2.APIErrorResponse{
		Error: protocolv2.ErrorBody{
			Code:    "not_implemented",
			Message: msg,
		},
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("HTTP JSON 响应写入失败", "err", err)
	}
}
