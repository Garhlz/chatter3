package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config 是应用全局配置，由环境变量或默认值填充。
type Config struct {
	// 服务器
	TCPPort  int
	HTTPPort int

	// 数据库
	DatabaseURL string

	// JWT
	JWTSecret     string
	JWTExpiration time.Duration

	// 文件
	UploadDir   string
	MaxFileSize int64 // bytes

	// 心跳
	HeartbeatTimeout time.Duration
}

// Load 从环境变量读取配置，缺失时使用默认值。
// 强制要求的字段（DatabaseURL、JWTSecret）若未设置则返回错误。
func Load() (*Config, error) {
	// 后端开发默认从 backend-go/.env 读取本地变量。
	// 这样做的目的不是绕开真实环境变量，而是给本地开发一个稳定入口：
	// - `.env` 适合本地开发机
	// - CI / 生产环境仍然可以直接注入真实环境变量
	// - 已存在的环境变量仍会覆盖 `.env` 中的值
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("加载 .env 失败: %w", err)
	}

	cfg := &Config{
		TCPPort:          intEnv("TCP_PORT", 9999),
		HTTPPort:         intEnv("HTTP_PORT", 8080),
		UploadDir:        strEnv("UPLOAD_DIR", "./upload_files"),
		MaxFileSize:      int64(intEnv("MAX_FILE_SIZE_MB", 50)) * 1024 * 1024,
		HeartbeatTimeout: durationEnv("HEARTBEAT_TIMEOUT", 90*time.Second),
		JWTExpiration:    durationEnv("JWT_EXPIRATION", 24*time.Hour),
	}

	cfg.DatabaseURL = os.Getenv("DATABASE_URL")
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL 环境变量未设置")
	}

	cfg.JWTSecret = os.Getenv("JWT_SECRET")
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET 环境变量未设置")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("JWT_SECRET 长度不足 32 字节")
	}

	slog.Info("配置加载完成",
		"tcp_port", cfg.TCPPort,
		"http_port", cfg.HTTPPort,
		"upload_dir", cfg.UploadDir,
		"heartbeat_timeout", cfg.HeartbeatTimeout,
	)
	return cfg, nil
}

func strEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func intEnv(key string, defaultVal int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return defaultVal
}

func durationEnv(key string, defaultVal time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return defaultVal
}
