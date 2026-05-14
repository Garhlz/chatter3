// Package repository provides database access layers.
//
// repository 只负责和数据库打交道，不负责密码哈希、JWT、HTTP 状态码、
// 或 protocol-v2 的输出结构。这样可以让上层 service 更容易复用。
package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgconn"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a requested entity does not exist.
var ErrNotFound = errors.New("not found")

// ErrUsernameTaken translates the users.username unique constraint into a stable business error.
var ErrUsernameTaken = errors.New("username already taken")

// DBUser mirrors the columns the auth flow needs from the users table.
type DBUser struct {
	UserID   int64
	Username string
	Password string
	Nickname string
}

// UserRepository handles user database operations.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository creates a new user repository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// GetByUsername retrieves a user by username.
func (r *UserRepository) GetByUsername(ctx context.Context, username string) (*DBUser, error) {
	query := `
		SELECT user_id, username, password, nickname
		FROM users
		WHERE username = $1
	`
	var u DBUser
	err := r.pool.QueryRow(ctx, query, username).Scan(
		&u.UserID, &u.Username, &u.Password, &u.Nickname,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("GetByUsername: %w", err)
	}
	return &u, nil
}

// GetByID retrieves a user by ID.
func (r *UserRepository) GetByID(ctx context.Context, userID int64) (*DBUser, error) {
	query := `
		SELECT user_id, username, password, nickname
		FROM users
		WHERE user_id = $1
	`
	var u DBUser
	err := r.pool.QueryRow(ctx, query, userID).Scan(
		&u.UserID, &u.Username, &u.Password, &u.Nickname,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("GetByID: %w", err)
	}
	return &u, nil
}

// ExistsByUsername checks if a username is already taken.
func (r *UserRepository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	query := `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)`
	var exists bool
	err := r.pool.QueryRow(ctx, query, username).Scan(&exists)
	return exists, err
}

// Create inserts a new user and returns the created user.
func (r *UserRepository) Create(ctx context.Context, username, passwordHash, nickname string) (int64, error) {
	query := `INSERT INTO users (username, password, nickname) VALUES ($1, $2, $3) RETURNING user_id`
	var userID int64
	err := r.pool.QueryRow(ctx, query, username, passwordHash, nickname).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return 0, ErrUsernameTaken
		}
		return 0, fmt.Errorf("Create user: %w", err)
	}
	return userID, nil
}

// UpdateLastLogin updates the last login timestamp for a user.
func (r *UserRepository) UpdateLastLogin(ctx context.Context, username string) error {
	query := `UPDATE users SET last_login_at = NOW() WHERE username = $1`
	_, err := r.pool.Exec(ctx, query, username)
	return err
}
