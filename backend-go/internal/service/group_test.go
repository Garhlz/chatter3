package service

import (
	"errors"
	"strings"
	"testing"
)

func TestGroupNameValidation(t *testing.T) {
	// Validate group name inline (just the validation logic from CreateGroup).

	validate := func(name string) error {
		name = strings.TrimSpace(name)
		if name == "" {
			return ErrGroupNameRequired
		}
		if len([]rune(name)) > maxGroupNameLength {
			return ErrGroupNameTooLong
		}
		return nil
	}

	if err := validate("   "); !errors.Is(err, ErrGroupNameRequired) {
		t.Fatalf("expected ErrGroupNameRequired, got %v", err)
	}

	longName := make([]rune, maxGroupNameLength+1)
	for i := range longName {
		longName[i] = 'x'
	}
	if err := validate(string(longName)); !errors.Is(err, ErrGroupNameTooLong) {
		t.Fatalf("expected ErrGroupNameTooLong, got %v", err)
	}

	if err := validate("valid-group"); err != nil {
		t.Fatalf("expected no validation error for valid name, got %v", err)
	}
}
