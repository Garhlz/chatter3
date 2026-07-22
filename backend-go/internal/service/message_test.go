package service

import (
	"errors"
	"strings"
	"testing"

	"github.com/elaine/chatter3/backend-go/internal/repository/sqlcgen"
)

func TestNormalizeTextContent(t *testing.T) {
	got, err := normalizeTextContent("  hello  ")
	if err != nil {
		t.Fatalf("expected valid content, got %v", err)
	}
	if got != "hello" {
		t.Fatalf("expected trimmed content, got %q", got)
	}

	if _, err := normalizeTextContent("   "); !errors.Is(err, ErrContentRequired) {
		t.Fatalf("expected ErrContentRequired, got %v", err)
	}

	tooLong := strings.Repeat("x", MaxTextContentLength+1)
	if _, err := normalizeTextContent(tooLong); !errors.Is(err, ErrContentTooLong) {
		t.Fatalf("expected ErrContentTooLong, got %v", err)
	}
}

func TestParseCursor(t *testing.T) {
	got, err := parseCursor("42")
	if err != nil {
		t.Fatalf("expected valid cursor, got %v", err)
	}
	if got != 42 {
		t.Fatalf("expected cursor 42, got %d", got)
	}

	if _, err := parseCursor("abc"); !errors.Is(err, ErrInvalidCursor) {
		t.Fatalf("expected ErrInvalidCursor, got %v", err)
	}
	if _, err := parseCursor("-1"); !errors.Is(err, ErrInvalidCursor) {
		t.Fatalf("expected ErrInvalidCursor for negative cursor, got %v", err)
	}
}

func TestToProtocolFileAllowsNullableMetadata(t *testing.T) {
	fileID := int64(7)
	row := sqlcgen.GetPublicHistoryRow{
		FileID: &fileID,
	}

	got := toProtocolFile(row)
	if got == nil {
		t.Fatal("expected file attachment, got nil")
	}
	if got.FileID != 7 {
		t.Fatalf("expected file id 7, got %d", got.FileID)
	}
	if got.FileName != "" || got.StoredFileName != "" || got.MIMEType != "" || got.Size != 0 {
		t.Fatalf("expected zero values for nil metadata, got %#v", got)
	}
}
