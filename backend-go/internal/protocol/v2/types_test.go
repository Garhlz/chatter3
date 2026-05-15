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

func TestGroupJSONShape(t *testing.T) {
	g := Group{
		GroupID:   1,
		GroupName: "test-group",
		Creator: User{
			UserID:   1,
			Username: "alice",
			Nickname: "Alice",
		},
		MemberCount: 3,
		CreatedAt:   "2026-05-15T12:00:00Z",
	}

	b, err := json.Marshal(g)
	if err != nil {
		t.Fatalf("marshal group: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal group: %v", err)
	}

	if got["groupID"] != float64(1) {
		t.Fatalf("expected groupID 1, got %v", got["groupID"])
	}
	if got["memberCount"] != float64(3) {
		t.Fatalf("expected memberCount 3, got %v", got["memberCount"])
	}
}

func TestGroupMemberJSONShape(t *testing.T) {
	gm := GroupMember{
		User: User{
			UserID:   2,
			Username: "bob",
			Nickname: "Bob",
			Online:   true,
		},
		Role:     1,
		JoinedAt: "2026-05-15T12:00:00Z",
	}

	b, err := json.Marshal(gm)
	if err != nil {
		t.Fatalf("marshal group member: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal group member: %v", err)
	}

	if got["role"] != float64(1) {
		t.Fatalf("expected role 1, got %v", got["role"])
	}
}

func TestMessageGroupIDOmitEmpty(t *testing.T) {
	public := Message{
		MessageID:   1,
		Scope:       "public",
		Sender:      User{UserID: 1, Username: "alice"},
		ContentType: "text",
		Content:     "hello",
		Timestamp:   "2026-05-15T12:00:00Z",
	}

	b, err := json.Marshal(public)
	if err != nil {
		t.Fatalf("marshal public message: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal public message: %v", err)
	}
	if _, ok := got["groupID"]; ok {
		t.Fatalf("expected groupID to be omitted for public scope, got %s", string(b))
	}

	group := Message{
		MessageID:   2,
		Scope:       "group",
		Sender:      User{UserID: 1, Username: "alice"},
		GroupID:     1,
		ContentType: "text",
		Content:     "hello group",
		Timestamp:   "2026-05-15T12:00:00Z",
	}

	b2, err := json.Marshal(group)
	if err != nil {
		t.Fatalf("marshal group message: %v", err)
	}

	var got2 map[string]any
	if err := json.Unmarshal(b2, &got2); err != nil {
		t.Fatalf("unmarshal group message: %v", err)
	}
	if got2["groupID"] != float64(1) {
		t.Fatalf("expected groupID 1 for group scope, got %v", got2["groupID"])
	}
}

func TestGroupSendPayloadJSONShape(t *testing.T) {
	p := GroupSendPayload{
		GroupID: 1,
		Content: "hello group",
	}

	b, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("marshal group send payload: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal group send payload: %v", err)
	}

	if got["groupID"] != float64(1) {
		t.Fatalf("expected groupID 1, got %v", got["groupID"])
	}
}
