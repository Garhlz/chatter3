package service

import (
	"context"
	"errors"
	"strconv"
	"strings"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
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

// GroupService owns group and group-message business rules.
type GroupService struct {
	groups   *repository.GroupsRepository
	users    *repository.UserRepository
	sessions *session.Manager
}

func NewGroupService(
	groups *repository.GroupsRepository,
	users *repository.UserRepository,
	sessions *session.Manager,
) *GroupService {
	return &GroupService{groups: groups, users: users, sessions: sessions}
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

	row, err := s.groups.CreateGroup(ctx, groupName, creatorUserID)
	if err != nil {
		return nil, err
	}

	if err := s.groups.AddMember(ctx, row.GroupID, creatorUserID, 2); err != nil {
		return nil, err
	}

	memberCount := 1
	for _, uname := range memberUsernames {
		uname = strings.TrimSpace(uname)
		if uname == "" || uname == creatorUsername {
			continue
		}
		u, err := s.users.GetByUsername(ctx, uname)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrMemberNotFound
		}
		if err != nil {
			return nil, err
		}
		if err := s.groups.AddMember(ctx, row.GroupID, u.UserID, 0); err != nil {
			return nil, err
		}
		memberCount++
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
		CreatedAt:   row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

// GetUserGroups returns the groups a user belongs to.
func (s *GroupService) GetUserGroups(ctx context.Context, userID int64) ([]protocolv2.Group, error) {
	rows, err := s.groups.GetUserGroups(ctx, userID)
	if err != nil {
		return nil, err
	}

	groups := make([]protocolv2.Group, 0, len(rows))
	for _, r := range rows {
		members, err := s.groups.GetGroupMembers(ctx, r.GroupID)
		if err != nil {
			return nil, err
		}
		groups = append(groups, protocolv2.Group{
			GroupID:   r.GroupID,
			GroupName: r.GroupName,
			Creator: protocolv2.User{
				UserID:   r.CreatorID,
				Username: r.CreatorUsername,
				Nickname: r.CreatorNickname,
				Online:   s.sessions.IsOnline(r.CreatorUsername),
			},
			MemberCount: len(members),
			CreatedAt:   r.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}
	return groups, nil
}

// GetGroupByID returns a single group by ID.
func (s *GroupService) GetGroupByID(ctx context.Context, groupID int64) (*protocolv2.Group, error) {
	row, err := s.groups.GetGroupByID(ctx, groupID)
	if err != nil {
		return nil, err
	}
	members, err := s.groups.GetGroupMembers(ctx, groupID)
	if err != nil {
		return nil, err
	}
	return &protocolv2.Group{
		GroupID:   row.GroupID,
		GroupName: row.GroupName,
		Creator: protocolv2.User{
			UserID:   row.CreatorID,
			Username: row.CreatorUsername,
			Nickname: row.CreatorNickname,
			Online:   s.sessions.IsOnline(row.CreatorUsername),
		},
		MemberCount: len(members),
		CreatedAt:   row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

// GetGroupMembers returns the member list for a group.
func (s *GroupService) GetGroupMembers(ctx context.Context, groupID int64) ([]protocolv2.GroupMember, error) {
	rows, err := s.groups.GetGroupMembers(ctx, groupID)
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
			JoinedAt: r.JoinedAt.UTC().Format("2006-01-02T15:04:05Z"),
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

	if _, err := s.groups.GetGroupByID(ctx, groupID); err != nil {
		return nil, nil, err
	}

	isMember, err := s.groups.IsMember(ctx, groupID, sender.UserID)
	if err != nil {
		return nil, nil, err
	}
	if !isMember {
		return nil, nil, ErrNotGroupMember
	}

	row, err := s.groups.InsertGroupMessage(ctx, sender.UserID, groupID, 0, content)
	if err != nil {
		return nil, nil, err
	}

	usernames, err := s.groups.GetMemberUsernames(ctx, groupID)
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
		Timestamp:   row.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}, usernames, nil
}

// GetGroupHistory returns cursor-paginated group message history.
func (s *GroupService) GetGroupHistory(ctx context.Context, userID, groupID int64, cursorStr string, limit int) ([]protocolv2.Message, string, error) {
	isMember, err := s.groups.IsMember(ctx, groupID, userID)
	if err != nil {
		return nil, "", err
	}
	if !isMember {
		return nil, "", ErrNotGroupMember
	}

	limit = clampLimit(limit)
	beforeID, err := parseCursor(cursorStr)
	if err != nil {
		return nil, "", err
	}

	rows, err := s.groups.GetGroupHistory(ctx, groupID, beforeID, limit)
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
			File:        toProtocolFile(r.File),
			Timestamp:   r.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
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
	role, err := s.groups.GetMemberRole(ctx, groupID, callerUserID)
	if err != nil {
		return nil, err
	}
	if role < 1 {
		return nil, ErrNotGroupAdmin
	}

	for _, uname := range usernames {
		uname = strings.TrimSpace(uname)
		if uname == "" {
			continue
		}
		u, err := s.users.GetByUsername(ctx, uname)
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrMemberNotFound
		}
		if err != nil {
			return nil, err
		}
		if err := s.groups.AddMember(ctx, groupID, u.UserID, 0); err != nil {
			return nil, err
		}
	}

	return s.GetGroupMembers(ctx, groupID)
}

// RemoveMember removes a user from a group. Caller must be admin/owner, or the user themselves.
func (s *GroupService) RemoveMember(ctx context.Context, callerUserID, groupID int64, targetUsername string) error {
	target, err := s.users.GetByUsername(ctx, targetUsername)
	if err != nil {
		return err
	}

	if callerUserID != target.UserID {
		callerRole, err := s.groups.GetMemberRole(ctx, groupID, callerUserID)
		if err != nil {
			return err
		}
		if callerRole < 1 {
			return ErrNotGroupAdmin
		}
	}

	targetRole, err := s.groups.GetMemberRole(ctx, groupID, target.UserID)
	if errors.Is(err, repository.ErrNotFound) {
		return ErrMemberNotFound
	}
	if err != nil {
		return err
	}
	if targetRole == 2 {
		return ErrCannotRemoveOwner
	}

	return s.groups.RemoveMember(ctx, groupID, target.UserID)
}
