package service

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"

	protocolv2 "github.com/elaine/chatter3/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter3/backend-go/internal/repository"
	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
	"github.com/elaine/chatter3/backend-go/internal/session"
)

const MaxTextContentLength = 4096

var (
	ErrContentRequired   = errors.New("content is required")
	ErrContentTooLong    = errors.New("content is too long")
	ErrReceiverRequired  = errors.New("receiverUsername is required")
	ErrCannotMessageSelf = errors.New("cannot send private message to yourself")
	ErrInvalidCursor     = errors.New("invalid cursor")
)

// MessageService owns message business rules shared by HTTP history and WS send paths.
type MessageService struct {
	queries  *sqlcgen.Queries
	sessions *session.Manager
}

func NewMessageService(
	queries *sqlcgen.Queries,
	sessions *session.Manager,
) *MessageService {
	return &MessageService{queries: queries, sessions: sessions}
}

// GetPublicHistory returns public messages in chronological display order.
func (s *MessageService) GetPublicHistory(ctx context.Context, cursorStr string, limit int) ([]protocolv2.Message, string, error) {
	limit = clampLimit(limit)
	beforeID, err := parseCursor(cursorStr)
	if err != nil {
		return nil, "", err
	}

	rows, err := s.queries.GetPublicHistory(ctx, sqlcgen.GetPublicHistoryParams{
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
			Scope:     "public",
			Sender: protocolv2.User{
				UserID:    r.SenderID,
				Username:  r.Username,
				Nickname:  r.Nickname,
				AvatarURL: r.AvatarUrl,
				Online:    s.sessions.IsOnline(r.Username),
			},
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

// GetPrivateHistory returns messages between current user and target username.
func (s *MessageService) GetPrivateHistory(ctx context.Context, currentUserID int64, otherUsername, cursorStr string, limit int) ([]protocolv2.Message, string, error) {
	otherUsername = strings.TrimSpace(otherUsername)
	if otherUsername == "" {
		return nil, "", ErrReceiverRequired
	}

	otherUser, err := s.queries.GetUserByUsername(ctx, otherUsername)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", repository.ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}

	limit = clampLimit(limit)
	beforeID, err := parseCursor(cursorStr)
	if err != nil {
		return nil, "", err
	}

	rows, err := s.queries.GetPrivateHistory(ctx, sqlcgen.GetPrivateHistoryParams{
		UserId1:  currentUserID,
		UserId2:  &otherUser.UserID,
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
			Scope:     "private",
			Sender: protocolv2.User{
				UserID:    r.SenderID,
				Username:  r.SenderUsername,
				Nickname:  r.SenderNickname,
				AvatarURL: r.SenderAvatarUrl,
				Online:    s.sessions.IsOnline(r.SenderUsername),
			},
			ReceiverUsername: r.ReceiverUsername,
			ContentType:      msgTypeToString(r.MessageType),
			Content:          r.Content,
			File:             toProtocolFile(r),
			Timestamp:        r.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
		})
	}

	var nextCursor string
	if len(rows) == limit {
		nextCursor = strconv.FormatInt(rows[len(rows)-1].MessageID, 10)
	}
	return msgs, nextCursor, nil
}

// CreatePublicMessage persists a lobby message and returns the realtime payload shape.
func (s *MessageService) CreatePublicMessage(ctx context.Context, sender *session.Session, content string) (*protocolv2.Message, error) {
	content, err := normalizeTextContent(content)
	if err != nil {
		return nil, err
	}

	row, err := s.queries.InsertPublicMessage(ctx, sqlcgen.InsertPublicMessageParams{
		SenderID:    sender.UserID,
		MessageType: 0,
		Content:     content,
	})
	if err != nil {
		return nil, err
	}

	return &protocolv2.Message{
		MessageID: row.MessageID,
		Scope:     "public",
		Sender: protocolv2.User{
			UserID:    sender.UserID,
			Username:  sender.Username,
			Nickname:  sender.Nickname,
			AvatarURL: sender.AvatarURL,
			Online:    true,
		},
		ContentType: "text",
		Content:     content,
		Timestamp:   row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}

// CreatePrivateMessage persists a DM. Offline recipients still receive the message in history.
func (s *MessageService) CreatePrivateMessage(ctx context.Context, sender *session.Session, receiverUsername, content string) (string, *protocolv2.Message, error) {
	receiverUsername = strings.TrimSpace(receiverUsername)
	if receiverUsername == "" {
		return "", nil, ErrReceiverRequired
	}
	if receiverUsername == sender.Username {
		return "", nil, ErrCannotMessageSelf
	}

	content, err := normalizeTextContent(content)
	if err != nil {
		return "", nil, err
	}

	receiver, err := s.queries.GetUserByUsername(ctx, receiverUsername)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, repository.ErrNotFound
	}
	if err != nil {
		return "", nil, err
	}

	row, err := s.queries.InsertPrivateMessage(ctx, sqlcgen.InsertPrivateMessageParams{
		SenderID:    sender.UserID,
		ReceiverID:  &receiver.UserID,
		MessageType: 0,
		Content:     content,
	})
	if err != nil {
		return "", nil, err
	}

	return receiver.Username, &protocolv2.Message{
		MessageID: row.MessageID,
		Scope:     "private",
		Sender: protocolv2.User{
			UserID:    sender.UserID,
			Username:  sender.Username,
			Nickname:  sender.Nickname,
			AvatarURL: sender.AvatarURL,
			Online:    true,
		},
		ReceiverUsername: receiver.Username,
		ContentType:      "text",
		Content:          content,
		Timestamp:        row.CreatedAt.Time.UTC().Format("2006-01-02T15:04:05Z"),
	}, nil
}
