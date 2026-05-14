package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/elaine/chatter2/backend-go/internal/config"
	"github.com/elaine/chatter2/backend-go/internal/dispatcher"
	"github.com/elaine/chatter2/backend-go/internal/session"
	"github.com/elaine/chatter2/backend-go/internal/storage"
	httptransport "github.com/elaine/chatter2/backend-go/internal/transport/http"
	tcptransport "github.com/elaine/chatter2/backend-go/internal/transport/tcp"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("配置加载失败", "err", err)
		os.Exit(1)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	pool, err := storage.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("数据库初始化失败", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Core shared components.
	sessions := session.NewManager()
	disp := dispatcher.New(sessions)

	var wg sync.WaitGroup

	// Legacy TCP server — kept running as a compatibility reference.
	// Remove this block once the v2 WebSocket path fully replaces it.
	wg.Add(1)
	go func() {
		defer wg.Done()
		tcpSrv := tcptransport.NewServer(cfg, sessions, disp)
		if err := tcpSrv.Run(ctx); err != nil {
			slog.Error("TCP 服务器退出", "err", err)
		}
	}()

	// v2 HTTP server — now receives pool and sessions so handlers can access DB and online state.
	wg.Add(1)
	go func() {
		defer wg.Done()
		httpSrv := httptransport.NewServer(cfg, pool, sessions)
		if err := httpSrv.Run(ctx); err != nil {
			slog.Error("HTTP 服务器退出", "err", err)
		}
	}()

	<-ctx.Done()
	slog.Info("收到退出信号，正在关闭...")
	wg.Wait()
	slog.Info("服务器已停止")
}
