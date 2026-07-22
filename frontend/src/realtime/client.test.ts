import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRealtimeClient } from "./client";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send() {}
  close() {}
}

describe("realtime reconnect accounting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not reset the attempt after a short-lived connection", () => {
    const attempts: number[] = [];
    const client = createRealtimeClient("ws://127.0.0.1:8080/api/v2/ws");
    client.connect("token", {
      onStatusChange: vi.fn(),
      onError: vi.fn(),
      onReady: vi.fn(),
      onPresence: vi.fn(),
      onPublicMessage: vi.fn(),
      onPrivateMessage: vi.fn(),
      onGroupMessage: vi.fn(),
      onGroupChanged: vi.fn(),
      onProfileChanged: vi.fn(),
      onReconnectScheduled: (attempt) => attempts.push(attempt),
    });

    const first = FakeWebSocket.instances[0];
    first.onopen?.();
    first.onclose?.();
    expect(attempts).toEqual([1]);

    vi.advanceTimersByTime(900);
    const second = FakeWebSocket.instances[1];
    second.onopen?.();
    second.onclose?.();

    expect(attempts).toEqual([1, 2]);
  });
});
