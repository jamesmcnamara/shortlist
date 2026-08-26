import { describe, expect, it } from "vitest";
import { getSafeRedirect } from "./redirect";

describe("getSafeRedirect", () => {
  it("keeps internal paths", () => {
    expect(getSafeRedirect("/join/abc?source=invite")).toBe(
      "/join/abc?source=invite",
    );
  });

  it("falls back for missing or external destinations", () => {
    expect(getSafeRedirect(null)).toBe("/");
    expect(getSafeRedirect("https://example.com")).toBe("/");
    expect(getSafeRedirect("//example.com")).toBe("/");
  });
});
