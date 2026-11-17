import { describe, expect, it } from "vitest";
import { closesTomorrow, cycleOf } from "./cycle";

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

describe("closesTomorrow", () => {
  it.each([
    ["2026-10-31T01:00:00Z", true], // Oct 30, the night before DST ends
    ["2026-10-30T01:00:00Z", false],
    ["2026-11-01T01:00:00Z", false], // Oct 31, the last day itself
    ["2026-02-28T01:00:00Z", true], // Feb 27
    ["2028-02-29T01:00:00Z", true], // Feb 28 in a leap year
    ["2028-02-28T01:00:00Z", false],
    ["2026-12-31T01:00:00Z", true], // Dec 30
  ])(
    "knows whether nominations close the day after %s (%s)",
    (iso, expected) => {
      expect(closesTomorrow(new Date(iso))).toBe(expected);
    },
  );
});
