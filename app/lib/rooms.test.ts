import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "@/app/lib/rooms";

describe("room input helpers", () => {
  it("normalizes names into URL-safe slugs", () => {
    expect(slugify("  My Movie Club!  ")).toBe("my-movie-club");
    expect(isValidSlug("my-movie-club")).toBe(true);
    expect(isValidSlug("not a slug")).toBe(false);
  });
});
