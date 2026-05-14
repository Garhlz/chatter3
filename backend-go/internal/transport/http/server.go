package http

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/elaine/chatter2/backend-go/internal/config"
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
	// 文件路由占位，P7 阶段实现
	mux.HandleFunc("POST /api/files/upload", s.handleUpload)
	mux.HandleFunc("GET /api/files/download/{storedFileName}", s.handleDownload)

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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

// handleUpload 和 handleDownload 在 P7 实现，此处返回 501。
func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "not implemented", http.StatusNotImplemented)
}
