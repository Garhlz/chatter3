package service

import (
	"fmt"
	"strconv"
	"strings"

	protocolv2 "github.com/elaine/chatter3/backend-go/internal/protocol/v2"
	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
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

func toProtocolFile(f sqlcgen.FileAttacher) *protocolv2.FileAttachment {
	if f.GetFileID() == nil {
		return nil
	}
	return &protocolv2.FileAttachment{
		FileID:         *f.GetFileID(),
		FileName:       optionalString(f.GetFileName()),
		StoredFileName: optionalString(f.GetStoredFileName()),
		DownloadURL:    fmt.Sprintf("/api/v2/files/%d", *f.GetFileID()),
		Size:           optionalInt64(f.GetFileSize()),
		MIMEType:       optionalString(f.GetFileType()),
	}
}

func optionalString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func optionalInt64(v *int64) int64 {
	if v == nil {
		return 0
	}
	return *v
}
