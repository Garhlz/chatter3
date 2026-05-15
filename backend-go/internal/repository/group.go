package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GroupRow is the DB view for a group with its creator info.
type GroupRow struct {
	GroupID         int64
	GroupName       string
	CreatorID       int64
	CreatedAt       time.Time
	CreatorUsername string
	CreatorNickname string
}

// GroupMemberRow is the DB view for a user in a group.
type GroupMemberRow struct {
	UserID   int64
	Username string
	Nickname string
	Role     int16
	JoinedAt time.Time
}

// GroupMessageRow is the DB view for a group message with sender and optional file.
type GroupMessageRow struct {
	MessageID   int64
	SenderID    int64
	Content     string
	MessageType int16
	CreatedAt   time.Time
	Username    string
	Nickname    string
	File        MessageFile
}

// GroupsRepository owns groups and group_members table access.
type GroupsRepository struct {
	pool *pgxpool.Pool
}

func NewGroupsRepository(pool *pgxpool.Pool) *GroupsRepository {
	return &GroupsRepository{pool: pool}
}

// CreateGroup inserts a new group and returns its generated fields.
func (r *GroupsRepository) CreateGroup(ctx context.Context, groupName string, creatorID int64) (*GroupRow, error) {
	var row GroupRow
	err := r.pool.QueryRow(ctx,
		`INSERT INTO groups (group_name, creator_id) VALUES ($1, $2)
		 RETURNING group_id, group_name, creator_id, created_at`,
		groupName, creatorID,
	).Scan(&row.GroupID, &row.GroupName, &row.CreatorID, &row.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("CreateGroup: %w", err)
	}
	return &row, nil
}

// AddMember adds a user to a group with the given role. No-op on conflict.
func (r *GroupsRepository) AddMember(ctx context.Context, groupID, userID int64, role int16) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)
		 ON CONFLICT (group_id, user_id) DO NOTHING`,
		groupID, userID, role,
	)
	if err != nil {
		return fmt.Errorf("AddMember: %w", err)
	}
	return nil
}

// GetGroupByID returns a group with its creator info.
func (r *GroupsRepository) GetGroupByID(ctx context.Context, groupID int64) (*GroupRow, error) {
	query := `
		SELECT g.group_id, g.group_name, g.creator_id, g.created_at,
		       u.username, u.nickname
		FROM groups g
		JOIN users u ON u.user_id = g.creator_id
		WHERE g.group_id = $1`

	var row GroupRow
	err := r.pool.QueryRow(ctx, query, groupID).Scan(
		&row.GroupID, &row.GroupName, &row.CreatorID, &row.CreatedAt,
		&row.CreatorUsername, &row.CreatorNickname,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("GetGroupByID: %w", err)
	}
	return &row, nil
}

// GetUserGroups returns the groups a user is a member of.
func (r *GroupsRepository) GetUserGroups(ctx context.Context, userID int64) ([]GroupRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT g.group_id, g.group_name, g.creator_id, g.created_at,
		       u.username, u.nickname
		FROM groups g
		JOIN group_members gm ON gm.group_id = g.group_id
		JOIN users u ON u.user_id = g.creator_id
		WHERE gm.user_id = $1
		ORDER BY g.created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("GetUserGroups: %w", err)
	}
	defer rows.Close()

	var groups []GroupRow
	for rows.Next() {
		var g GroupRow
		if err := rows.Scan(&g.GroupID, &g.GroupName, &g.CreatorID, &g.CreatedAt,
			&g.CreatorUsername, &g.CreatorNickname); err != nil {
			return nil, fmt.Errorf("GetUserGroups scan: %w", err)
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

// GetGroupMembers returns members of a group ordered by join time.
func (r *GroupsRepository) GetGroupMembers(ctx context.Context, groupID int64) ([]GroupMemberRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.user_id, u.username, u.nickname, gm.role, gm.joined_at
		FROM group_members gm
		JOIN users u ON u.user_id = gm.user_id
		WHERE gm.group_id = $1
		ORDER BY gm.joined_at ASC`, groupID)
	if err != nil {
		return nil, fmt.Errorf("GetGroupMembers: %w", err)
	}
	defer rows.Close()

	var members []GroupMemberRow
	for rows.Next() {
		var m GroupMemberRow
		if err := rows.Scan(&m.UserID, &m.Username, &m.Nickname, &m.Role, &m.JoinedAt); err != nil {
			return nil, fmt.Errorf("GetGroupMembers scan: %w", err)
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// IsMember returns true if the user is a member of the group.
func (r *GroupsRepository) IsMember(ctx context.Context, groupID, userID int64) (bool, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM group_members WHERE group_id = $1 AND user_id = $2`,
		groupID, userID,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("IsMember: %w", err)
	}
	return count > 0, nil
}

// GetMemberUsernames returns all member usernames for broadcast targeting.
func (r *GroupsRepository) GetMemberUsernames(ctx context.Context, groupID int64) ([]string, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.username
		FROM group_members gm
		JOIN users u ON u.user_id = gm.user_id
		WHERE gm.group_id = $1`, groupID)
	if err != nil {
		return nil, fmt.Errorf("GetMemberUsernames: %w", err)
	}
	defer rows.Close()

	var usernames []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, fmt.Errorf("GetMemberUsernames scan: %w", err)
		}
		usernames = append(usernames, u)
	}
	return usernames, rows.Err()
}

// InsertGroupMessage inserts a message into a group.
func (r *GroupsRepository) InsertGroupMessage(ctx context.Context, senderID, groupID int64, messageType int16, content string) (*MessageInsert, error) {
	var row MessageInsert
	err := r.pool.QueryRow(ctx,
		`INSERT INTO messages (sender_id, group_id, message_type, content)
		 VALUES ($1, $2, $3, $4)
		 RETURNING message_id, created_at`,
		senderID, groupID, messageType, content,
	).Scan(&row.MessageID, &row.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("InsertGroupMessage: %w", err)
	}
	return &row, nil
}

// GetGroupHistory returns group messages in message_id DESC order (service layer reverses).
func (r *GroupsRepository) GetGroupHistory(ctx context.Context, groupID, beforeID int64, limit int) ([]GroupMessageRow, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT m.message_id, m.sender_id, m.content, m.message_type, m.created_at,
		       u.username, u.nickname,
		       f.file_id, f.file_name, f.stored_file_name, f.file_size, f.file_type
		FROM messages m
		JOIN users u ON u.user_id = m.sender_id
		LEFT JOIN files f ON f.message_id = m.message_id
		WHERE m.group_id = $1
		  AND ($2::bigint = 0 OR m.message_id < $2)
		ORDER BY m.message_id DESC
		LIMIT $3`,
		groupID, beforeID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetGroupHistory: %w", err)
	}
	defer rows.Close()

	var msgs []GroupMessageRow
	for rows.Next() {
		var m GroupMessageRow
		if err := rows.Scan(
			&m.MessageID, &m.SenderID, &m.Content, &m.MessageType, &m.CreatedAt,
			&m.Username, &m.Nickname,
			&m.File.FileID, &m.File.FileName, &m.File.StoredFileName, &m.File.FileSize, &m.File.MIMEType,
		); err != nil {
			return nil, fmt.Errorf("GetGroupHistory scan: %w", err)
		}
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

// RemoveMember removes a user from a group.
func (r *GroupsRepository) RemoveMember(ctx context.Context, groupID, userID int64) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
		groupID, userID,
	)
	if err != nil {
		return fmt.Errorf("RemoveMember: %w", err)
	}
	return nil
}

// GetMemberRole returns the role of a user in a group.
func (r *GroupsRepository) GetMemberRole(ctx context.Context, groupID, userID int64) (int16, error) {
	var role int16
	err := r.pool.QueryRow(ctx,
		`SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2`,
		groupID, userID,
	).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	if err != nil {
		return 0, fmt.Errorf("GetMemberRole: %w", err)
	}
	return role, nil
}
