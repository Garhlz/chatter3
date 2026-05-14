// Package service provides business logic layers.
//
// 这一层位于 repository 和 transport 之间，负责：
//   - 输入约束
//   - 密码哈希与校验
//   - JWT 签发
//   - 将底层数据库错误翻译为稳定的业务错误
package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/elaine/chatter2/backend-go/internal/auth"
	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
)

var (
	// ErrUsernameTaken is returned when attempting to register a username that already exists.
	ErrUsernameTaken = errors.New("username already taken")

	// ErrInvalidCredentials deliberately merges "unknown user" and "wrong password".
	// This prevents the API from leaking which usernames exist.
	ErrInvalidCredentials = errors.New("invalid username or password")
)

// UserService handles user-related business logic.
type UserService struct {
	userRepo *repository.UserRepository
	jwtSvc   *auth.JWTService
}

// NewUserService creates a new user service.
func NewUserService(userRepo *repository.UserRepository, jwtSvc *auth.JWTService) *UserService {
	return &UserService{
		userRepo: userRepo,
		jwtSvc:   jwtSvc,
	}
}

// Register creates a new user account with the given credentials.
func (s *UserService) Register(ctx context.Context, username, password, nickname string) (*protocolv2.User, error) {
	// 这里保留最小业务约束，避免把“HTTP 能过但业务不合法”的输入直接打进数据库。
	if username == "" || password == "" {
		return nil, fmt.Errorf("username and password are required")
	}
	if len(password) < 6 {
		return nil, fmt.Errorf("password must be at least 6 characters")
	}
	if len(username) > 50 {
		return nil, fmt.Errorf("username must be 50 characters or fewer")
	}

	exists, err := s.userRepo.ExistsByUsername(ctx, username)
	if err != nil {
		return nil, fmt.Errorf("failed to check username: %w", err)
	}
	if exists {
		return nil, ErrUsernameTaken
	}

	passwordHash, err := auth.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	userID, err := s.userRepo.Create(ctx, username, passwordHash, nickname)
	if err != nil {
		if errors.Is(err, repository.ErrUsernameTaken) {
			return nil, ErrUsernameTaken
		}
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return &protocolv2.User{
		UserID:   userID,
		Username: username,
		Nickname: nickname,
		Online:   false,
	}, nil
}

// Login verifies user credentials and returns a JWT token.
func (s *UserService) Login(ctx context.Context, username, password string) (string, *protocolv2.User, error) {
	dbUser, err := s.userRepo.GetByUsername(ctx, username)
	if errors.Is(err, repository.ErrNotFound) {
		return "", nil, ErrInvalidCredentials
	}
	if err != nil {
		return "", nil, fmt.Errorf("failed to get user: %w", err)
	}

	if err := auth.CheckPassword(password, dbUser.Password); err != nil {
		return "", nil, ErrInvalidCredentials
	}

	// best-effort：不让统计字段影响登录主流程。
	_ = s.userRepo.UpdateLastLogin(ctx, dbUser.Username)

	token, err := s.jwtSvc.Sign(dbUser.UserID, dbUser.Username, dbUser.Nickname)
	if err != nil {
		return "", nil, fmt.Errorf("failed to sign token: %w", err)
	}

	return token, &protocolv2.User{
		UserID:   dbUser.UserID,
		Username: dbUser.Username,
		Nickname: dbUser.Nickname,
		Online:   false,
	}, nil
}
