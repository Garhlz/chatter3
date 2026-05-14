-- name: GetUserByUsername :one
SELECT user_id, username, password, nickname, avatar_url, status, created_at, last_login_at
FROM users
WHERE username = $1;

-- name: GetUserByID :one
SELECT user_id, username, password, nickname, avatar_url, status, created_at, last_login_at
FROM users
WHERE user_id = $1;

-- name: CreateUser :one
INSERT INTO users (username, password, nickname)
VALUES ($1, $2, $3)
RETURNING user_id, username, nickname, avatar_url, status, created_at;

-- name: CountUserByUsername :one
SELECT COUNT(*) FROM users WHERE username = $1;

-- name: UpdateLastLogin :exec
UPDATE users SET last_login_at = NOW() WHERE username = $1;

-- name: ListAllUsers :many
SELECT user_id, username, nickname, avatar_url, status, created_at, last_login_at
FROM users
ORDER BY username;
