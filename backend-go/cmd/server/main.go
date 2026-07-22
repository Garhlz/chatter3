package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/elaine/chatter3/backend-go/internal/config"
	"github.com/elaine/chatter3/backend-go/internal/session"
	"github.com/elaine/chatter3/backend-go/internal/storage"
	httptransport "github.com/elaine/chatter3/backend-go/internal/transport/http"
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

	var wg sync.WaitGroup

	// v2 HTTP server.
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
