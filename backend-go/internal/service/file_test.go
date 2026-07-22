package service

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

func TestFileUploadRejectsPrivateAndGroupTargetsTogether(t *testing.T) {
	svc := &FileService{uploadDir: t.TempDir(), maxFileSize: 1024}
	_, err := svc.SaveUpload(context.Background(), FileUploadInput{
		SenderID: 1, SenderUsername: "alice", ReceiverUsername: "bob", GroupID: 7,
		FileName: "both.txt", Size: 4, Reader: bytes.NewBufferString("test"),
	})
	if !errors.Is(err, ErrInvalidFileTarget) {
		t.Fatalf("expected ErrInvalidFileTarget, got %v", err)
	}
}
