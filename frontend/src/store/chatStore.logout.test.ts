import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  });
  Object.defineProperty(globalThis.window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

vi.mock("../desktop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../desktop")>();
  return {
    ...actual,
    clearToken: vi.fn(),
  };
});

import { clearToken } from "../desktop";
import { useChatStore } from "./chatStore";

describe("logout", () => {
  beforeEach(() => {
    vi.mocked(clearToken).mockReset();
    useChatStore.setState({
      token: "persisted-token",
      currentUser: {
        userId: 1,
        username: "alice",
        nickname: "Alice",
      },
      status: "connected",
      error: "",
    });
  });

  it("clears the authenticated UI even when credential deletion fails", async () => {
    vi.mocked(clearToken).mockRejectedValueOnce(new Error("keyring unavailable"));

    await useChatStore.getState().logout();

    const state = useChatStore.getState();
    expect(state.token).toBe("");
    expect(state.currentUser).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.error).toContain("keyring unavailable");
  });
});
