import { describe, expect, it } from "vitest";
import type { ChatMessageView } from "../store/helpers";
import { buildMessageTimeline } from "./messageTimeline";

function message(
  localId: string,
  senderUsername: string,
  timestamp: string,
): ChatMessageView {
  return {
    localId,
    messageId: Number(localId),
    scope: "public",
    sender: {
      userId: senderUsername === "elaine" ? 1 : 2,
      username: senderUsername,
      nickname: senderUsername,
    },
    contentType: "text",
    content: `message ${localId}`,
    timestamp,
    deliveryStatus: "sent",
  };
}

describe("buildMessageTimeline", () => {
  it("groups adjacent messages from one sender within five minutes", () => {
    const timeline = buildMessageTimeline([
      message("1", "elaine", "2026-07-22T10:00:00+08:00"),
      message("2", "elaine", "2026-07-22T10:04:59+08:00"),
    ]);

    expect(timeline).toHaveLength(2);
    expect(timeline[0].type).toBe("date");
    expect(timeline[1]).toMatchObject({
      type: "message-group",
      senderUsername: "elaine",
    });
    if (timeline[1].type === "message-group") {
      expect(timeline[1].messages).toHaveLength(2);
    }
  });

  it("starts a new group when the sender changes or the time window expires", () => {
    const timeline = buildMessageTimeline([
      message("1", "elaine", "2026-07-22T10:00:00+08:00"),
      message("2", "bob", "2026-07-22T10:01:00+08:00"),
      message("3", "bob", "2026-07-22T10:07:00+08:00"),
    ]);

    expect(timeline.filter((entry) => entry.type === "message-group")).toHaveLength(3);
  });

  it("does not merge messages whose timestamps are out of order", () => {
    const timeline = buildMessageTimeline([
      message("1", "elaine", "2026-07-22T10:05:00+08:00"),
      message("2", "elaine", "2026-07-22T10:04:00+08:00"),
    ]);

    expect(timeline.filter((entry) => entry.type === "message-group")).toHaveLength(2);
  });

  it("adds a date separator and breaks grouping at a local day boundary", () => {
    const timeline = buildMessageTimeline([
      message("1", "elaine", "2026-07-22T23:59:00+08:00"),
      message("2", "elaine", "2026-07-23T00:01:00+08:00"),
    ]);

    expect(timeline.map((entry) => entry.type)).toEqual([
      "date",
      "message-group",
      "date",
      "message-group",
    ]);
  });
});
