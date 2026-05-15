package auth

import (
	"testing"
	"time"
)

func TestJWTSignAndValidate(t *testing.T) {
	svc := NewJWTService("test-secret-that-is-at-least-32-bytes", time.Hour)

	token, err := svc.Sign(42, "alice", "Alice")
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if token == "" {
		t.Fatalf("expected non-empty token")
	}

	claims, err := svc.Verify(token)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if claims.UserID != 42 {
		t.Fatalf("expected UserID 42, got %d", claims.UserID)
	}
	if claims.Username != "alice" {
		t.Fatalf("expected username alice, got %q", claims.Username)
	}
	if claims.Nickname != "Alice" {
		t.Fatalf("expected nickname Alice, got %q", claims.Nickname)
	}
}

func TestJWTValidateExpiredToken(t *testing.T) {
	svc := NewJWTService("test-secret-that-is-at-least-32-bytes", 1*time.Millisecond)

	token, err := svc.Sign(1, "bob", "Bob")
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	time.Sleep(2 * time.Millisecond)

	_, err = svc.Verify(token)
	if err == nil {
		t.Fatalf("expected error for expired token")
	}
}

func TestJWTValidateWrongSecret(t *testing.T) {
	svcA := NewJWTService("secret-a-that-is-at-least-32-bytes!", time.Hour)
	svcB := NewJWTService("secret-b-that-is-at-least-32-bytes!", time.Hour)

	token, err := svcA.Sign(1, "carol", "Carol")
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	_, err = svcB.Verify(token)
	if err == nil {
		t.Fatalf("expected error for wrong secret")
	}
}

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := HashPassword("correct-horse-battery-staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "" {
		t.Fatalf("expected non-empty hash")
	}

	if err := CheckPassword("correct-horse-battery-staple", hash); err != nil {
		t.Fatalf("check correct password: %v", err)
	}

	if err := CheckPassword("wrong-password", hash); err == nil {
		t.Fatalf("expected error for wrong password")
	}
}

func TestBcryptHashIsSaltIndependent(t *testing.T) {
	hash1, err := HashPassword("the-same-password")
	if err != nil {
		t.Fatalf("first hash: %v", err)
	}
	hash2, err := HashPassword("the-same-password")
	if err != nil {
		t.Fatalf("second hash: %v", err)
	}
	if hash1 == hash2 {
		t.Fatalf("expected different hashes due to unique salts")
	}
}
