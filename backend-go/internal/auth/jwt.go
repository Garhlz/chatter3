// Package auth contains authentication helpers shared by HTTP and, later,
// WebSocket code paths.
//
// 这里刻意把 JWT 和密码哈希放在同一个包里：
//   - 两者都属于“认证边界”的能力
//   - handler 不应该直接依赖 bcrypt 或 jwt 细节
//   - 后续接入 WebSocket 时，也能复用同一套 token 解析逻辑
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Claims is the authenticated user identity embedded in JWTs.
//
// 字段尽量保持业务含义直白，这样 HTTP middleware、未来的 WS 握手、
// 以及调试日志都能直接复用这份结构。
type Claims struct {
	UserID   int64  `json:"userId"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	jwt.RegisteredClaims
}

// JWTService handles JWT token generation and verification.
type JWTService struct {
	secret     []byte
	expiration time.Duration
}

// NewJWTService creates a new JWT service with the given secret and expiration.
func NewJWTService(secret string, expiration time.Duration) *JWTService {
	return &JWTService{
		secret:     []byte(secret),
		expiration: expiration,
	}
}

// Sign generates a JWT token for the given user.
func (s *JWTService) Sign(userID int64, username, nickname string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		Username: username,
		Nickname: nickname,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.expiration)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

// Verify validates a JWT token and returns its claims.
func (s *JWTService) Verify(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.secret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}

const bcryptCost = 12

// HashPassword converts a plaintext password into a bcrypt hash.
//
// 这一步必须放在 service 层调用，而不是让 repository 隐式做，
// 否则 repository 就会同时承担“业务规则”和“数据访问”两种职责。
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

// CheckPassword compares a plaintext password with a stored bcrypt hash.
func CheckPassword(password, storedHash string) error {
	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password)); err != nil {
		return fmt.Errorf("password mismatch: %w", err)
	}
	return nil
}
