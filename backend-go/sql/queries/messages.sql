-- name: InsertPublicMessage :one
INSERT INTO messages (sender_id, message_type, content)
VALUES ($1, $2, $3)
RETURNING message_id, created_at;

-- name: InsertPrivateMessage :one
INSERT INTO messages (sender_id, receiver_id, message_type, content)
VALUES ($1, $2, $3, $4)
RETURNING message_id, created_at;

-- name: InsertFile :one
INSERT INTO files (message_id, file_name, stored_file_name, file_url, file_size, file_type, md5)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING file_id;

-- name: GetPublicHistory :many
SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
       u.username, u.nickname, u.avatar_url,
       f.file_id, f.file_name, f.stored_file_name, f.file_size, f.file_type
FROM messages m
JOIN users u ON u.user_id = m.sender_id
LEFT JOIN files f ON f.message_id = m.message_id
WHERE m.receiver_id IS NULL AND m.group_id IS NULL
  AND (sqlc.arg('before_id')::bigint = 0 OR m.message_id < sqlc.arg('before_id'))
ORDER BY m.message_id DESC
LIMIT sqlc.arg('limit');

-- name: GetPrivateHistory :many
SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.message_type, m.created_at,
       s.username AS sender_username, s.nickname AS sender_nickname, s.avatar_url AS sender_avatar_url,
       r.username AS receiver_username, r.nickname AS receiver_nickname,
       f.file_id, f.file_name, f.stored_file_name, f.file_size, f.file_type
FROM messages m
JOIN users s ON s.user_id = m.sender_id
JOIN users r ON r.user_id = m.receiver_id
LEFT JOIN files f ON f.message_id = m.message_id
WHERE m.receiver_id IS NOT NULL
  AND ((m.sender_id = sqlc.arg('user_id1') AND m.receiver_id = sqlc.arg('user_id2'))
       OR (m.sender_id = sqlc.arg('user_id2') AND m.receiver_id = sqlc.arg('user_id1')))
  AND (sqlc.arg('before_id')::bigint = 0 OR m.message_id < sqlc.arg('before_id'))
ORDER BY m.message_id DESC
LIMIT sqlc.arg('limit');

-- name: GetFileByID :one
SELECT f.file_id, f.message_id, m.sender_id, m.receiver_id,
       m.group_id,
       f.file_name, f.stored_file_name, f.file_url, f.file_size, f.file_type,
       COALESCE(f.md5, '') AS md5, m.created_at
FROM files f
JOIN messages m ON m.message_id = f.message_id
WHERE f.file_id = $1;
