package tcp

import (
	"context"
	"fmt"
	"log/slog"
	"net"

	"github.com/elaine/chatter2/backend-go/internal/config"
	"github.com/elaine/chatter2/backend-go/internal/dispatcher"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

// Server 监听 TCP 端口，为每个连接启动读写 goroutine。
type Server struct {
	cfg        *config.Config
	sessions   *session.Manager
	dispatcher *dispatcher.Dispatcher
}

func NewServer(cfg *config.Config, sessions *session.Manager, d *dispatcher.Dispatcher) *Server {
	return &Server{cfg: cfg, sessions: sessions, dispatcher: d}
}

// Run 启动 accept 循环，ctx 取消时优雅停止。
func (s *Server) Run(ctx context.Context) error {
	addr := fmt.Sprintf(":%d", s.cfg.TCPPort)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("TCP 监听失败: %w", err)
	}
	slog.Info("TCP 服务器已启动", "addr", addr)

	go func() {
		<-ctx.Done()
		ln.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				return nil
			default:
				slog.Error("accept 失败", "err", err)
				continue
			}
		}
		slog.Info("新连接", "remote", conn.RemoteAddr())
		c := newConn(conn, s.cfg, s.sessions, s.dispatcher)
		go c.run(ctx)
	}
}
