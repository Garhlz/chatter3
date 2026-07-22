-- name: CreateGroup :one
INSERT INTO groups (group_name, creator_id)
VALUES ($1, $2)
RETURNING group_id, group_name, creator_id, created_at;

-- name: AddGroupMember :exec
INSERT INTO group_members (group_id, user_id, role)
VALUES ($1, $2, $3)
ON CONFLICT (group_id, user_id) DO NOTHING;

-- name: GetGroupByID :one
SELECT g.group_id, g.group_name, g.creator_id, g.created_at,
       u.username, u.nickname, u.avatar_url
FROM groups g
JOIN users u ON u.user_id = g.creator_id
WHERE g.group_id = $1;

-- name: GetUserGroups :many
SELECT g.group_id, g.group_name, g.creator_id, g.created_at,
       u.username, u.nickname, u.avatar_url
FROM groups g
JOIN group_members gm ON gm.group_id = g.group_id
JOIN users u ON u.user_id = g.creator_id
WHERE gm.user_id = $1
ORDER BY g.created_at DESC;

-- name: GetGroupMembers :many
SELECT u.user_id, u.username, u.nickname, u.avatar_url, gm.role, gm.joined_at
FROM group_members gm
JOIN users u ON u.user_id = gm.user_id
WHERE gm.group_id = $1
ORDER BY gm.joined_at ASC;

-- name: IsGroupMember :one
SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND user_id = $2;

-- name: GetMemberUsernames :many
SELECT u.username
FROM group_members gm
JOIN users u ON u.user_id = gm.user_id
WHERE gm.group_id = $1;

-- name: InsertGroupMessage :one
INSERT INTO messages (sender_id, group_id, message_type, content)
VALUES ($1, $2, $3, $4)
RETURNING message_id, created_at;

-- name: GetGroupHistory :many
SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
       u.username, u.nickname, u.avatar_url,
       f.file_id, f.file_name, f.stored_file_name, f.file_size, f.file_type
FROM messages m
JOIN users u ON u.user_id = m.sender_id
LEFT JOIN files f ON f.message_id = m.message_id
WHERE m.group_id = sqlc.arg('group_id')
  AND (sqlc.arg('before_id')::bigint = 0 OR m.message_id < sqlc.arg('before_id'))
ORDER BY m.message_id DESC
LIMIT sqlc.arg('limit');

-- name: RemoveGroupMember :exec
DELETE FROM group_members WHERE group_id = $1 AND user_id = $2;

-- name: GetMemberRole :one
SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2;
