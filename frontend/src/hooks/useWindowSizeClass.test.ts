import { describe, expect, it } from "vitest";
import { resolveWindowSizeClass } from "./useWindowSizeClass";

describe("resolveWindowSizeClass", () => {
  it.each([
    [1600, "expanded"],
    [1200, "regular"],
    [900, "compact"],
    [700, "narrow-desktop"],
  ] as const)("maps %d px to %s", (width, expected) => {
    expect(resolveWindowSizeClass(width)).toBe(expected);
  });
});
