-- name: CreateGroup :one
INSERT INTO groups (group_name, creator_id)
VALUES ($1, $2)
RETURNING group_id, group_name, creator_id, created_at;

-- name: GetGroupByID :one
SELECT group_id, group_name, creator_id, created_at FROM groups WHERE group_id = $1;

-- name: DeleteGroup :exec
DELETE FROM groups WHERE group_id = $1;

-- name: AddGroupMember :exec
INSERT INTO group_members (group_id, user_id, role)
VALUES ($1, $2, $3)
ON CONFLICT (group_id, user_id) DO NOTHING;

-- name: RemoveGroupMember :exec
DELETE FROM group_members WHERE group_id = $1 AND user_id = $2;

-- name: DeleteAllGroupMembers :exec
DELETE FROM group_members WHERE group_id = $1;

-- name: IsUserInGroup :one
SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND user_id = $2;

-- name: GetGroupMembers :many
SELECT u.user_id, u.username, u.nickname, u.avatar_url, u.status, gm.role
FROM group_members gm
JOIN users u ON u.user_id = gm.user_id
WHERE gm.group_id = $1;

-- name: GetUserGroups :many
-- 某用户所在的所有群组及其成员
SELECT g.group_id, g.group_name, g.creator_id, g.created_at
FROM groups g
JOIN group_members gm ON gm.group_id = g.group_id
WHERE gm.user_id = $1;
