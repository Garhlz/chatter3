package config

import (
	"testing"
	"time"
)

func TestLoadRequiresDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes")

	_, err := Load()
	if err == nil {
		t.Fatalf("expected error for missing DATABASE_URL")
	}
}

func TestLoadRequiresJWTSecret(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://localhost:5432/db")
	t.Setenv("JWT_SECRET", "")

	_, err := Load()
	if err == nil {
		t.Fatalf("expected error for missing JWT_SECRET")
	}
}

func TestLoadRequiresJWTSecretMinLength(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://localhost:5432/db")
	t.Setenv("JWT_SECRET", "too-short")

	_, err := Load()
	if err == nil {
		t.Fatalf("expected error for JWT_SECRET shorter than 32 bytes")
	}
}

func TestLoadDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://localhost:5432/db")
	t.Setenv("JWT_SECRET", "test-secret-that-is-at-least-32-bytes")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.DatabaseURL != "postgresql://localhost:5432/db" {
		t.Fatalf("unexpected DatabaseURL: %q", cfg.DatabaseURL)
	}
	if cfg.HTTPPort != 8080 {
		t.Fatalf("expected default HTTPPort 8080, got %d", cfg.HTTPPort)
	}
	if cfg.UploadDir != "./upload_files" {
		t.Fatalf("expected default UploadDir, got %q", cfg.UploadDir)
	}
	if cfg.MaxFileSize != 50*1024*1024 {
		t.Fatalf("expected default MaxFileSize 50MB, got %d", cfg.MaxFileSize)
	}
	if cfg.HeartbeatTimeout != 90*time.Second {
		t.Fatalf("expected default HeartbeatTimeout 90s, got %v", cfg.HeartbeatTimeout)
	}
	if cfg.JWTExpiration != 24*time.Hour {
		t.Fatalf("expected default JWTExpiration 24h, got %v", cfg.JWTExpiration)
	}
}

func TestLoadCustomValues(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://custom:5432/db")
	t.Setenv("JWT_SECRET", "custom-secret-abcdefghijklmnopqrstuvwxyz123")
	t.Setenv("HTTP_PORT", "9090")
	t.Setenv("UPLOAD_DIR", "/tmp/uploads")
	t.Setenv("MAX_FILE_SIZE_MB", "10")
	t.Setenv("HEARTBEAT_TIMEOUT", "30s")
	t.Setenv("JWT_EXPIRATION", "1h")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if cfg.HTTPPort != 9090 {
		t.Fatalf("expected HTTPPort 9090, got %d", cfg.HTTPPort)
	}
	if cfg.MaxFileSize != 10*1024*1024 {
		t.Fatalf("expected MaxFileSize 10MB, got %d", cfg.MaxFileSize)
	}
	if cfg.HeartbeatTimeout != 30*time.Second {
		t.Fatalf("expected HeartbeatTimeout 30s, got %v", cfg.HeartbeatTimeout)
	}
	if cfg.JWTExpiration != 1*time.Hour {
		t.Fatalf("expected JWTExpiration 1h, got %v", cfg.JWTExpiration)
	}
}
