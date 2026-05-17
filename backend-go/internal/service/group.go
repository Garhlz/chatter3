package service

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
	"github.com/elaine/chatter2/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter2/backend-go/internal/session"
)

const maxGroupNameLength = 50

var (
	ErrGroupNameRequired = errors.New("group name is required")
	ErrGroupNameTooLong  = errors.New("group name is too long")
	ErrNotGroupMember    = errors.New("you are not a member of this group")
	ErrMemberNotFound    = errors.New("one or more members not found")
	ErrNotGroupAdmin     = errors.New("you must be an admin or owner")
	ErrCannotRemoveOwner = errors.New("cannot remove the group owner")
)

// Group member role constants (matches DB CHECK constraint: 0=member, 1=admin, 2=owner).
const (
	GroupRoleMember = 0
	GroupRoleAdmin  = 1
	GroupRoleOwner  = 2
)

// GroupService owns group and group-message business rules.
type GroupService struct {
	pool     *pgxpool.Pool
	queries  *sqlcgen.Queries
	sessions *session.Manager
}

func NewGroupService(
	pool *pgxpool.Pool,
	queries *sqlcgen.Queries,
	sessions *session.Manager,
) *GroupService {
	return &GroupService{pool: pool, queries: queries, sessions: sessions}
}

// CreateGroup inserts a group, makes the creator owner, and optionally adds initial members.
func (s *GroupService) CreateGroup(ctx context.Context, creatorUserID int64, creatorUsername, creatorNickname, groupName string, memberUsernames []string) (*protocolv2.Group, error) {
	groupName = strings.TrimSpace(groupName)
	if groupName == "" {
		return nil, ErrGroupNameRequired
	}
	if len([]rune(groupName)) > maxGroupNameLength {
		return nil, ErrGroupNameTooLong
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	q := s.queries.WithTx(tx)

	row, err := q.CreateGroup(ctx, sqlcgen.CreateGroupParams{
		GroupName: groupName,
		CreatorID: creatorUserID,
	})
	if err != nil {
		return nil, err
	}

	if err := q.AddGroupMember(ctx, sqlcgen.AddGroupMemberParams{
		GroupID: row.GroupID,
		UserID:  creatorUserID,
		Role:    GroupRoleOwner,
	}); err != nil {
		return nil, err
	}

	memberCount := 1
	for _, uname := range memberUsernames {
		uname = strings.TrimSpace(uname)
		if uname == "" || uname == creatorUsername {
			continue
		}
		u, err := q.GetUserByUsername(ctx, uname)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMemberNotFound
		}
		if err != nil {
			return nil, err
		}
		if err := q.AddGroupMember(ctx, sqlcgen.AddGroupMemberParams{
			GroupID: row.GroupID,
			UserID:  u.UserID,
			Role:    GroupRoleMember,
		}); err != nil {
			return nil, err
		}
		memberCount++
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return &protocolv2.Group{
		GroupID:   row.GroupID,
		GroupName: row.GroupName,
		Creator: protocolv2.User{
			UserID:   creatorUserID,
			Username: creatorUsername,
			Nickname: creatorNickname,
			Online:   s.sessions.IsOnline(creatorUsername),
		},
		MemberCount: memberCount,
		CreatedAt:   row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

// GetUserGroups returns the groups a user belongs to.
func (s *GroupService) GetUserGroups(ctx context.Context, userID int64) ([]protocolv2.Group, error) {
	rows, err := s.queries.GetUserGroups(ctx, userID)
	if err != nil {
		return nil, err
	}

	groups := make([]protocolv2.Group, 0, len(rows))
	for _, r := range rows {
		members, err := s.queries.GetGroupMembers(ctx, r.GroupID)
		if err != nil {
			return nil, err
		}
		groups = append(groups, protocolv2.Group{
			GroupID:   r.GroupID,
			GroupName: r.GroupName,
			Creator: protocolv2.User{
				UserID:   r.CreatorID,
				Username: r.Username,
				Nickname: r.Nickname,
				Online:   s.sessions.IsOnline(r.Username),
			},
			MemberCount: len(members),
			CreatedAt:   r.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	return groups, nil
}

// GetGroupByIDForUser returns a single group by ID for a member of that group.
func (s *GroupService) GetGroupByIDForUser(ctx context.Context, userID, groupID int64) (*protocolv2.Group, error) {
	if err := s.ensureGroupMember(ctx, userID, groupID); err != nil {
		return nil, err
	}

	row, err := s.queries.GetGroupByID(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, repository.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	members, err := s.queries.GetGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	return &protocolv2.Group{
		GroupID:   row.GroupID,
		GroupName: row.GroupName,
		Creator: protocolv2.User{
			UserID:   row.CreatorID,
			Username: row.Username,
			Nickname: row.Nickname,
			Online:   s.sessions.IsOnline(row.Username),
		},
		MemberCount: len(members),
		CreatedAt:   row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

// GetGroupMembersForUser returns the member list for a group visible to its members.
func (s *GroupService) GetGroupMembersForUser(ctx context.Context, userID, groupID int64) ([]protocolv2.GroupMember, error) {
	if err := s.ensureGroupMember(ctx, userID, groupID); err != nil {
		return nil, err
	}

	rows, err := s.queries.GetGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	members := make([]protocolv2.GroupMember, 0, len(rows))
	for _, r := range rows {
		members = append(members, protocolv2.GroupMember{
			User: protocolv2.User{
				UserID:   r.UserID,
				Username: r.Username,
				Nickname: r.Nickname,
				Online:   s.sessions.IsOnline(r.Username),
			},
			Role:     r.Role,
			JoinedAt: r.JoinedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	return members, nil
}

// SendGroupMessage validates membership, persists the message, and returns it for broadcast.
func (s *GroupService) SendGroupMessage(ctx context.Context, sender *session.Session, groupID int64, content string) (*protocolv2.Message, []string, error) {
	content, err := normalizeTextContent(content)
	if err != nil {
		return nil, nil, err
	}

	if _, err := s.queries.GetGroupByID(ctx, groupID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, repository.ErrNotFound
		}
		return nil, nil, err
	}

	count, err := s.queries.IsGroupMember(ctx, sqlcgen.IsGroupMemberParams{
		GroupID: groupID,
		UserID:  sender.UserID,
	})
	if err != nil {
		return nil, nil, err
	}
	if count == 0 {
		return nil, nil, ErrNotGroupMember
	}

	row, err := s.queries.InsertGroupMessage(ctx, sqlcgen.InsertGroupMessageParams{
		SenderID:    sender.UserID,
		GroupID:     &groupID,
		MessageType: 0,
		Content:     content,
	})
	if err != nil {
		return nil, nil, err
	}

	usernames, err := s.queries.GetMemberUsernames(ctx, groupID)
	if err != nil {
		return nil, nil, err
	}

	return &protocolv2.Message{
		MessageID: row.MessageID,
		Scope:     "group",
		Sender: protocolv2.User{
			UserID:   sender.UserID,
			Username: sender.Username,
			Nickname: sender.Nickname,
			Online:   true,
		},
		GroupID:     groupID,
		ContentType: "text",
		Content:     content,
		Timestamp:   row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
	}, usernames, nil
}

// GetGroupHistory returns cursor-paginated group message history.
func (s *GroupService) GetGroupHistory(ctx context.Context, userID, groupID int64, cursorStr string, limit int) ([]protocolv2.Message, string, error) {
	if err := s.ensureGroupExists(ctx, groupID); err != nil {
		return nil, "", err
	}

	count, err := s.queries.IsGroupMember(ctx, sqlcgen.IsGroupMemberParams{
		GroupID: groupID,
		UserID:  userID,
	})
	if err != nil {
		return nil, "", err
	}
	if count == 0 {
		return nil, "", ErrNotGroupMember
	}

	limit = clampLimit(limit)
	beforeID, err := parseCursor(cursorStr)
	if err != nil {
		return nil, "", err
	}

	rows, err := s.queries.GetGroupHistory(ctx, sqlcgen.GetGroupHistoryParams{
		GroupID:  &groupID,
		BeforeID: beforeID,
		Limit:    int32(limit),
	})
	if err != nil {
		return nil, "", err
	}

	msgs := make([]protocolv2.Message, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		r := rows[i]
		msgs = append(msgs, protocolv2.Message{
			MessageID: r.MessageID,
			Scope:     "group",
			Sender: protocolv2.User{
				UserID:   r.SenderID,
				Username: r.Username,
				Nickname: r.Nickname,
				Online:   s.sessions.IsOnline(r.Username),
			},
			GroupID:     groupID,
			ContentType: msgTypeToString(r.MessageType),
			Content:     r.Content,
			File:        toProtocolFile(r),
			Timestamp:   r.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}

	var nextCursor string
	if len(rows) == limit {
		nextCursor = strconv.FormatInt(rows[len(rows)-1].MessageID, 10)
	}
	return msgs, nextCursor, nil
}

// AddMembers adds users to a group. Caller must be admin or owner.
func (s *GroupService) AddMembers(ctx context.Context, callerUserID, groupID int64, usernames []string) ([]protocolv2.GroupMember, error) {
	if err := s.ensureGroupExists(ctx, groupID); err != nil {
		return nil, err
	}

	role, err := s.queries.GetMemberRole(ctx, sqlcgen.GetMemberRoleParams{
		GroupID: groupID,
		UserID:  callerUserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotGroupAdmin
	}
	if err != nil {
		return nil, err
	}
	if role < GroupRoleAdmin {
		return nil, ErrNotGroupAdmin
	}

	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	q := s.queries.WithTx(tx)

	for _, uname := range usernames {
		uname = strings.TrimSpace(uname)
		if uname == "" {
			continue
		}
		u, err := q.GetUserByUsername(ctx, uname)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMemberNotFound
		}
		if err != nil {
			return nil, err
		}
		if err := q.AddGroupMember(ctx, sqlcgen.AddGroupMemberParams{
			GroupID: groupID,
			UserID:  u.UserID,
			Role:    GroupRoleMember,
		}); err != nil {
			return nil, err
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}

	return s.GetGroupMembersForUser(ctx, callerUserID, groupID)
}

// RemoveMember removes a user from a group. Caller must be admin/owner, or the user themselves.
func (s *GroupService) RemoveMember(ctx context.Context, callerUserID, groupID int64, targetUsername string) error {
	if err := s.ensureGroupExists(ctx, groupID); err != nil {
		return err
	}

	target, err := s.queries.GetUserByUsername(ctx, targetUsername)
	if errors.Is(err, pgx.ErrNoRows) {
		return repository.ErrNotFound
	}
	if err != nil {
		return err
	}

	if callerUserID != target.UserID {
		callerRole, err := s.queries.GetMemberRole(ctx, sqlcgen.GetMemberRoleParams{
			GroupID: groupID,
			UserID:  callerUserID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotGroupAdmin
		}
		if err != nil {
			return err
		}
		if callerRole < GroupRoleAdmin {
			return ErrNotGroupAdmin
		}
	}

	targetRole, err := s.queries.GetMemberRole(ctx, sqlcgen.GetMemberRoleParams{
		GroupID: groupID,
		UserID:  target.UserID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrMemberNotFound
	}
	if err != nil {
		return err
	}
	if targetRole == GroupRoleOwner {
		return ErrCannotRemoveOwner
	}

	return s.queries.RemoveGroupMember(ctx, sqlcgen.RemoveGroupMemberParams{
		GroupID: groupID,
		UserID:  target.UserID,
	})
}

func (s *GroupService) ensureGroupExists(ctx context.Context, groupID int64) error {
	_, err := s.queries.GetGroupByID(ctx, groupID)
	if errors.Is(err, pgx.ErrNoRows) {
		return repository.ErrNotFound
	}
	return err
}

func (s *GroupService) ensureGroupMember(ctx context.Context, userID, groupID int64) error {
	if err := s.ensureGroupExists(ctx, groupID); err != nil {
		return err
	}

	count, err := s.queries.IsGroupMember(ctx, sqlcgen.IsGroupMemberParams{
		GroupID: groupID,
		UserID:  userID,
	})
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotGroupMember
	}
	return nil
}
