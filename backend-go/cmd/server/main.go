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
	// 结构化日志
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

	// 数据库
	pool, err := storage.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("数据库初始化失败", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// 核心组件
	sessions := session.NewManager()
	disp := dispatcher.New(sessions)

	// 启动服务
	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		tcpSrv := tcptransport.NewServer(cfg, sessions, disp)
		if err := tcpSrv.Run(ctx); err != nil {
			slog.Error("TCP 服务器退出", "err", err)
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		httpSrv := httptransport.NewServer(cfg)
		if err := httpSrv.Run(ctx); err != nil {
			slog.Error("HTTP 服务器退出", "err", err)
		}
	}()

	<-ctx.Done()
	slog.Info("收到退出信号，正在关闭...")
	wg.Wait()
	slog.Info("服务器已停止")
}
