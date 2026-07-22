import type { ChatMessageView } from "../store/helpers";

export type TimelineEntry =
  | { type: "date"; key: string; timestamp: string }
  | {
      type: "message-group";
      key: string;
      senderUsername: string;
      messages: ChatMessageView[];
    };

const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

function localDateKey(timestamp: string) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function buildMessageTimeline(messages: ChatMessageView[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let previousDateKey = "";
  let currentGroup: Extract<TimelineEntry, { type: "message-group" }> | null = null;

  for (const message of messages) {
    const dateKey = localDateKey(message.timestamp);
    if (dateKey !== previousDateKey) {
      entries.push({ type: "date", key: `date:${dateKey}`, timestamp: message.timestamp });
      previousDateKey = dateKey;
      currentGroup = null;
    }

    const previousMessage = currentGroup?.messages.at(-1);
    const elapsedSincePrevious = previousMessage
      ? new Date(message.timestamp).getTime() - new Date(previousMessage.timestamp).getTime()
      : Number.POSITIVE_INFINITY;
    const closeInTime =
      elapsedSincePrevious >= 0 && elapsedSincePrevious <= MESSAGE_GROUP_WINDOW_MS;
    const belongsToCurrentGroup =
      currentGroup?.senderUsername === message.sender.username && closeInTime;

    if (belongsToCurrentGroup && currentGroup) {
      currentGroup.messages.push(message);
      continue;
    }

    currentGroup = {
      type: "message-group",
      key: `group:${message.localId}`,
      senderUsername: message.sender.username,
      messages: [message],
    };
    entries.push(currentGroup);
  }

  return entries;
}
