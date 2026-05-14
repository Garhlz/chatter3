-- name: InsertMessage :one
INSERT INTO messages (sender_id, receiver_id, group_id, message_type, content)
VALUES ($1, $2, $3, $4, $5)
RETURNING message_id, created_at;

-- name: GetLobbyMessages :many
-- 大厅消息：receiver_id IS NULL AND group_id IS NULL
SELECT m.message_id, m.sender_id, m.content, m.created_at,
       u.username, u.nickname
FROM messages m
JOIN users u ON u.user_id = m.sender_id
WHERE m.receiver_id IS NULL AND m.group_id IS NULL
  AND m.message_type = 0
ORDER BY m.created_at ASC
LIMIT 100;

-- name: GetPrivateMessages :many
-- 某用户的所有私聊记录（发出 + 收到）
SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.message_type, m.created_at,
       s.username AS sender_username, s.nickname AS sender_nickname,
       r.username AS receiver_username
FROM messages m
JOIN users s ON s.user_id = m.sender_id
JOIN users r ON r.user_id = m.receiver_id
WHERE m.receiver_id IS NOT NULL
  AND (m.sender_id = $1 OR m.receiver_id = $1)
ORDER BY m.created_at ASC;

-- name: GetGroupMessages :many
-- 某用户参与的所有群组的群聊记录
SELECT m.message_id, m.sender_id, m.group_id, m.content, m.created_at,
       u.username, u.nickname
FROM messages m
JOIN users u ON u.user_id = m.sender_id
WHERE m.group_id IN (
    SELECT group_id FROM group_members WHERE user_id = $1
)
ORDER BY m.created_at ASC;

-- name: GetFileByMessageID :one
SELECT file_id, message_id, file_name, stored_file_name, file_url, file_size, file_type, md5, upload_time
FROM files
WHERE message_id = $1;

-- name: GetFileByStoredName :one
SELECT file_id, message_id, file_name, stored_file_name, file_url, file_size, file_type, md5, upload_time
FROM files
WHERE stored_file_name = $1;

-- name: InsertFile :one
INSERT INTO files (message_id, file_name, stored_file_name, file_url, file_size, file_type, md5)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING file_id, upload_time;
