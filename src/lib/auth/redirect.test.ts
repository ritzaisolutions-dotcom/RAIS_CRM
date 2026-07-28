import { describe, expect, it } from "vitest";
import { safeInternalRedirect } from "./redirect";

describe("safeInternalRedirect", () => {
  it("keeps internal paths including query strings", () => {
    expect(safeInternalRedirect("/firma/123?tab=kontakte")).toBe(
      "/firma/123?tab=kontakte",
    );
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "javascript:alert(1)",
    "/login",
    "/login/reset",
    null,
  ])("rejects unsafe redirect %s", (candidate) => {
    expect(safeInternalRedirect(candidate)).toBe("/liste");
  });
});
