package v2

import (
	"encoding/json"
	"testing"
)

func TestLoginResponseJSONShape(t *testing.T) {
	resp := APIResponse[LoginResponse]{
		Data: LoginResponse{
			Token: "token",
			User: User{
				UserID:   1,
				Username: "alice",
				Nickname: "Alice",
				Online:   true,
			},
		},
	}

	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("marshal login response: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal login response: %v", err)
	}

	if _, ok := got["data"]; !ok {
		t.Fatalf("expected top-level data field, got %s", string(b))
	}
}

func TestEventJSONShape(t *testing.T) {
	ev := Event[PublicSendPayload]{
		Event:     "chat.public.send",
		RequestID: "req-1",
		Payload: PublicSendPayload{
			Content: "hello",
		},
	}

	b, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal event: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}

	if got["event"] != "chat.public.send" {
		t.Fatalf("unexpected event field: %v", got["event"])
	}
	if _, ok := got["payload"]; !ok {
		t.Fatalf("expected payload field, got %s", string(b))
	}
}
