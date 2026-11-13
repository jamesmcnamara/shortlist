import { describe, expect, it } from "vitest";
import { cycleOf } from "./cycle";

describe("cycleOf", () => {
  it.each([
    ["2026-03-01T07:59:59Z", "2026-02"],
    ["2026-03-01T08:00:00Z", "2026-03"],
    ["2026-04-01T06:59:59Z", "2026-03"],
    ["2026-04-01T07:00:00Z", "2026-04"],
    ["2027-01-01T07:59:59Z", "2026-12"],
    ["2027-01-01T08:00:00Z", "2027-01"],
  ])("puts %s in %s (months roll over at midnight Pacific)", (iso, cycle) => {
    expect(cycleOf(new Date(iso))).toBe(cycle);
  });
});
