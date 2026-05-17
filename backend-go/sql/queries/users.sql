-- name: GetUserByUsername :one
SELECT user_id, username, password, nickname
FROM users
WHERE username = $1;

-- name: GetUserByID :one
SELECT user_id, username, password, nickname, avatar_url, bio, email, gender, created_at
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

-- name: UpdateUserProfile :exec
UPDATE users
SET nickname = COALESCE($2, nickname),
    bio = COALESCE($3, bio),
    email = COALESCE($4, email),
    gender = COALESCE($5, gender)
WHERE user_id = $1;

-- name: GetUserProfile :one
SELECT user_id, username, nickname, avatar_url, bio, email, gender, created_at
FROM users
WHERE username = $1;
