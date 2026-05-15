-- name: GetUserByUsername :one
SELECT user_id, username, password, nickname
FROM users
WHERE username = $1;

-- name: GetUserByID :one
SELECT user_id, username, password, nickname
FROM users
WHERE user_id = $1;

-- name: ExistsByUsername :one
SELECT EXISTS(SELECT 1 FROM users WHERE username = $1);

-- name: CreateUser :one
INSERT INTO users (username, password, nickname)
VALUES ($1, $2, $3)
RETURNING user_id;

-- name: UpdateLastLogin :exec
UPDATE users SET last_login_at = NOW() WHERE username = $1;
