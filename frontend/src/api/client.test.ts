import { afterEach, describe, expect, it, vi } from "vitest";
import { createAPIClient } from "./client";

describe("file upload targets", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends groupID for a group upload without receiverUsername", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { file: { fileId: 1 } } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAPIClient("").uploadFile(
      "token",
      new File(["hello"], "hello.txt", { type: "text/plain" }),
      { scope: "group", groupID: 42 },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("groupID")).toBe("42");
    expect(form.has("receiverUsername")).toBe(false);
  });

  it("sends receiverUsername only for a private upload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { file: { fileId: 2 } } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAPIClient("").uploadFile(
      "token",
      new File(["hello"], "hello.txt"),
      { scope: "private", receiverUsername: "bob" },
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("receiverUsername")).toBe("bob");
    expect(form.has("groupID")).toBe(false);
  });
});
