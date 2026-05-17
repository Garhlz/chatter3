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
	"github.com/elaine/chatter2/backend-go/internal/session"
)

var (
	// ErrUsernameTaken is returned when attempting to register a username that already exists.
	ErrUsernameTaken = errors.New("username already taken")

	// ErrInvalidCredentials deliberately merges "unknown user" and "wrong password".
	// This prevents the API from leaking which usernames exist.
	ErrInvalidCredentials = errors.New("invalid username or password")

	// ErrInvalidProfileInput marks profile validation failures as client errors.
	ErrInvalidProfileInput = errors.New("invalid profile input")
)

// UserService handles user-related business logic.
type UserService struct {
	queries  *sqlcgen.Queries
	jwtSvc   *auth.JWTService
	sessions *session.Manager
}

// NewUserService creates a new user service.
func NewUserService(queries *sqlcgen.Queries, jwtSvc *auth.JWTService, sessions *session.Manager) *UserService {
	return &UserService{
		queries:  queries,
		jwtSvc:   jwtSvc,
		sessions: sessions,
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

// GetUserProfile returns a user's public profile. Email is only included when
// the caller requests their own profile.
func (s *UserService) GetUserProfile(ctx context.Context, username string, callerUserID int64) (*protocolv2.OwnProfile, error) {
	row, err := s.queries.GetUserProfile(ctx, username)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user profile: %w", err)
	}

	profile := &protocolv2.OwnProfile{
		UserProfile: protocolv2.UserProfile{
			User: protocolv2.User{
				UserID:    row.UserID,
				Username:  row.Username,
				Nickname:  row.Nickname,
				AvatarURL: row.AvatarUrl,
			},
			Bio:       row.Bio,
			Gender:    row.Gender,
			CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		},
	}
	if row.UserID == callerUserID && row.Email != nil {
		profile.Email = *row.Email
	}
	return profile, nil
}

// UpdateUserProfile updates the calling user's own profile fields.
func (s *UserService) UpdateUserProfile(ctx context.Context, userID int64, req *protocolv2.UpdateProfileRequest) (*protocolv2.OwnProfile, error) {
	row, err := s.queries.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	if req.Nickname != nil && len(*req.Nickname) > 50 {
		return nil, fmt.Errorf("%w: nickname must be 50 characters or fewer", ErrInvalidProfileInput)
	}

	params := sqlcgen.UpdateUserProfileParams{
		UserID:   userID,
		Nickname: row.Nickname,
		Bio:      row.Bio,
		Email:    row.Email,
		Gender:   row.Gender,
	}
	if req.Nickname != nil {
		params.Nickname = *req.Nickname
	}
	if req.Bio != nil {
		params.Bio = *req.Bio
	}
	if req.Email != nil {
		v := *req.Email
		params.Email = &v
	}
	if req.Gender != nil {
		params.Gender = *req.Gender
	}
	if err := s.queries.UpdateUserProfile(ctx, params); err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	row, err = s.queries.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to reload user: %w", err)
	}

	if s.sessions != nil {
		s.sessions.UpdateNickname(row.UserID, row.Nickname)
	}

	return &protocolv2.OwnProfile{
		UserProfile: protocolv2.UserProfile{
			User: protocolv2.User{
				UserID:    row.UserID,
				Username:  row.Username,
				Nickname:  row.Nickname,
				AvatarURL: row.AvatarUrl,
			},
			Bio:       row.Bio,
			Gender:    row.Gender,
			CreatedAt: row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		},
		Email: stringOrEmpty(row.Email),
	}, nil
}

// GetIdentity returns the latest persisted public identity for a user.
func (s *UserService) GetIdentity(ctx context.Context, userID int64) (*protocolv2.User, error) {
	row, err := s.queries.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &protocolv2.User{
		UserID:    row.UserID,
		Username:  row.Username,
		Nickname:  row.Nickname,
		AvatarURL: row.AvatarUrl,
		Online:    false,
	}, nil
}

func stringOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
