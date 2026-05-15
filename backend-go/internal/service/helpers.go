package service

import (
	"fmt"
	"strconv"
	"strings"

	protocolv2 "github.com/elaine/chatter2/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter2/backend-go/internal/repository"
)

func normalizeTextContent(content string) (string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "", ErrContentRequired
	}
	if len([]rune(content)) > MaxTextContentLength {
		return "", ErrContentTooLong
	}
	return content, nil
}

func parseCursor(s string) (int64, error) {
	if s == "" {
		return 0, nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("%w: %q", ErrInvalidCursor, s)
	}
	return n, nil
}

func clampLimit(n int) int {
	if n <= 0 || n > 100 {
		return 50
	}
	return n
}

func msgTypeToString(t int16) string {
	if t == 1 {
		return "file"
	}
	return "text"
}

func toProtocolFile(file repository.MessageFile) *protocolv2.FileAttachment {
	if !file.FileID.Valid {
		return nil
	}
	return &protocolv2.FileAttachment{
		FileID:         file.FileID.Int64,
		FileName:       file.FileName.String,
		StoredFileName: file.StoredFileName.String,
		DownloadURL:    fmt.Sprintf("/api/v2/files/%d", file.FileID.Int64),
		Size:           file.FileSize.Int64,
		MIMEType:       file.MIMEType.String,
	}
}
