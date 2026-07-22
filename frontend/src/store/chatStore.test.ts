import { describe, expect, it } from "vitest";
import { sortedConversationList, type Conversation } from "./helpers";

describe("selectConversationList", () => {
  it("does not expose a private conversation with the current user", () => {
    const conversations: Record<string, Conversation> = {
      public: {
        id: "public",
        scope: "public",
        title: "Lobby",
        peerUsername: "",
        description: "",
        unreadCount: 0,
      },
      "private:elaine": {
        id: "private:elaine",
        scope: "private",
        title: "Elaine",
        peerUsername: "elaine",
        description: "",
        unreadCount: 0,
      },
      "private:bob": {
        id: "private:bob",
        scope: "private",
        title: "Bob",
        peerUsername: "bob",
        description: "",
        unreadCount: 0,
      },
    };

    expect(sortedConversationList(conversations, "elaine").map((conversation) => conversation.id)).toEqual([
      "public",
      "private:bob",
    ]);
  });
});
