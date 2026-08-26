import { describe, expect, it } from "vitest";
import {
  isValidSlug,
  parseConfigUpdate,
  slugify,
} from "@/app/lib/rooms";

describe("room input helpers", () => {
  it("normalizes names into URL-safe slugs", () => {
    expect(slugify("  My Movie Club!  ")).toBe("my-movie-club");
    expect(isValidSlug("my-movie-club")).toBe(true);
    expect(isValidSlug("not a slug")).toBe(false);
  });

  it("accepts partial config updates", () => {
    expect(
      parseConfigUpdate({
        nominationsPerCycle: null,
        votesPerCycle: "3",
        allowSelfVote: true,
      }),
    ).toEqual({
      ok: true,
      values: {
        nominationsPerCycle: null,
        votesPerCycle: 3,
        allowSelfVote: true,
      },
    });
  });

  it("rejects invalid config values", () => {
    expect(parseConfigUpdate({ nominationsPerCycle: 0 }).ok).toBe(false);
    expect(parseConfigUpdate({ votesPerCycle: -1 }).ok).toBe(false);
    expect(parseConfigUpdate({ cycleLength: "day" }).ok).toBe(false);
    expect(parseConfigUpdate({ allowSelfVote: "yes" }).ok).toBe(false);
  });
});
