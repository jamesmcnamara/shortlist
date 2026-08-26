import { describe, expect, it } from "vitest";
import { cycleFor, isCycleLength } from "./cycles";
import type { CycleLength } from "@/src/db/schema";

const room = (cycleLength: CycleLength, createdAt: string) => ({
  cycleLength,
  createdAt: new Date(createdAt),
});

describe("cycleFor", () => {
  it("keeps 'never' rooms in a single always-open cycle", () => {
    const watchlist = room("never", "2024-01-01T00:00:00Z");
    expect(cycleFor(watchlist, new Date("2024-01-01T00:00:00Z"))).toBe(0);
    expect(cycleFor(watchlist, new Date("2031-06-14T00:00:00Z"))).toBe(0);
  });

  describe("month", () => {
    const club = room("month", "2024-01-10T12:00:00Z");

    it("starts at cycle 0", () => {
      expect(cycleFor(club, new Date("2024-01-10T12:00:00Z"))).toBe(0);
    });

    it("stays in cycle 0 until the day-of-month is reached", () => {
      expect(cycleFor(club, new Date("2024-02-09T23:00:00Z"))).toBe(0);
    });

    it("respects the time of day on the anniversary", () => {
      expect(cycleFor(club, new Date("2024-02-10T11:59:00Z"))).toBe(0);
    });

    it("advances on the anniversary instant", () => {
      expect(cycleFor(club, new Date("2024-02-10T12:00:00Z"))).toBe(1);
    });

    it("counts across a year boundary", () => {
      expect(cycleFor(club, new Date("2025-01-10T12:00:00Z"))).toBe(12);
    });

    it("clamps when the room was created on a day the month lacks", () => {
      const endOfMonth = room("month", "2024-01-31T00:00:00Z");
      // February has no 31st, so the cycle turns over at its end.
      expect(cycleFor(endOfMonth, new Date("2024-02-28T00:00:00Z"))).toBe(0);
      expect(cycleFor(endOfMonth, new Date("2024-02-29T00:00:00Z"))).toBe(1);
      expect(cycleFor(endOfMonth, new Date("2024-03-31T00:00:00Z"))).toBe(2);
    });
  });

  describe("week", () => {
    const weekly = room("week", "2024-01-01T00:00:00Z");

    it("starts at cycle 0", () => {
      expect(cycleFor(weekly, new Date("2024-01-01T00:00:00Z"))).toBe(0);
    });

    it("holds the cycle for the last moment of the week", () => {
      expect(cycleFor(weekly, new Date("2024-01-07T23:59:59Z"))).toBe(0);
    });

    it("advances after seven days", () => {
      expect(cycleFor(weekly, new Date("2024-01-08T00:00:00Z"))).toBe(1);
    });
  });

  it("never returns a negative cycle for moments before the room existed", () => {
    expect(
      cycleFor(room("month", "2024-06-01T00:00:00Z"), new Date("2024-01-01")),
    ).toBe(0);
  });
});

describe("isCycleLength", () => {
  it("accepts the supported lengths", () => {
    expect(isCycleLength("month")).toBe(true);
    expect(isCycleLength("week")).toBe(true);
    expect(isCycleLength("never")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isCycleLength("fortnight")).toBe(false);
    expect(isCycleLength(3)).toBe(false);
    expect(isCycleLength(null)).toBe(false);
  });
});
