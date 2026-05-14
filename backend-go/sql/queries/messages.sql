-- name: InsertPublicMessage :one
-- 插入大厅（公开）消息。scope 由 receiver_id IS NULL AND group_id IS NULL 隐含。
INSERT INTO messages (sender_id, message_type, content)
VALUES ($1, $2, $3)
RETURNING message_id, created_at;

-- name: InsertPrivateMessage :one
-- 插入私聊消息，receiver_id 必须非空。
INSERT INTO messages (sender_id, receiver_id, message_type, content)
VALUES ($1, $2, $3, $4)
RETURNING message_id, created_at;

-- name: GetPublicHistory :many
-- 大厅消息游标分页：before_id=0 表示从最新开始，否则取 message_id < before_id 的记录。
-- 结果按 message_id DESC，调用方负责翻转顺序以供前端展示。
SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
       u.username, u.nickname
FROM messages m
JOIN users u ON u.user_id = m.sender_id
WHERE m.receiver_id IS NULL AND m.group_id IS NULL
  AND ($1::bigint = 0 OR m.message_id < $1)
ORDER BY m.message_id DESC
LIMIT $2;

-- name: GetPrivateHistory :many
-- 两个用户之间的私聊记录，双向匹配（sender→receiver 或 receiver→sender）。
-- before_id=0 表示从最新开始，否则取 message_id < before_id 的记录。
SELECT m.message_id, m.sender_id, m.receiver_id, m.content, m.message_type, m.created_at,
       s.username AS sender_username, s.nickname AS sender_nickname,
       r.username AS receiver_username, r.nickname AS receiver_nickname
FROM messages m
JOIN users s ON s.user_id = m.sender_id
JOIN users r ON r.user_id = m.receiver_id
WHERE m.receiver_id IS NOT NULL
  AND (
    (m.sender_id = $1 AND m.receiver_id = $2)
    OR (m.sender_id = $2 AND m.receiver_id = $1)
  )
  AND ($3::bigint = 0 OR m.message_id < $3)
ORDER BY m.message_id DESC
LIMIT $4;

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
