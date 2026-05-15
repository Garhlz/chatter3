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

	"github.com/jackc/pgconn"
	"github.com/jackc/pgx/v5"

	"github.com/elaine/chatter2/backend-go/internal/auth"
	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository/sqlcgen"
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
	queries *sqlcgen.Queries
	jwtSvc  *auth.JWTService
}

// NewUserService creates a new user service.
func NewUserService(queries *sqlcgen.Queries, jwtSvc *auth.JWTService) *UserService {
	return &UserService{
		queries: queries,
		jwtSvc:  jwtSvc,
	}
}

// Register creates a new user account with the given credentials.
func (s *UserService) Register(ctx context.Context, username, password, nickname string) (*protocolv2.User, error) {
	if username == "" || password == "" {
		return nil, fmt.Errorf("username and password are required")
	}
	if len(password) < 6 {
		return nil, fmt.Errorf("password must be at least 6 characters")
	}
	if len(username) > 50 {
		return nil, fmt.Errorf("username must be 50 characters or fewer")
	}

	exists, err := s.queries.ExistsByUsername(ctx, username)
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

	userID, err := s.queries.CreateUser(ctx, sqlcgen.CreateUserParams{
		Username: username,
		Password: passwordHash,
		Nickname: nickname,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
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
	dbUser, err := s.queries.GetUserByUsername(ctx, username)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrInvalidCredentials
	}
	if err != nil {
		return "", nil, fmt.Errorf("failed to get user: %w", err)
	}

	if err := auth.CheckPassword(password, dbUser.Password); err != nil {
		return "", nil, ErrInvalidCredentials
	}

	// best-effort：不让统计字段影响登录主流程。
	_ = s.queries.UpdateLastLogin(ctx, dbUser.Username)

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
