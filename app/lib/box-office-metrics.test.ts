import { describe, expect, it } from "vitest";
import type { BoxOffice } from "./box-office";
import { boxOfficeMetrics, compactMoney, floorThreeDigits, formatMultiplier } from "./box-office-metrics";
import { heat } from "./heat";

const data: BoxOffice = {
  source: "boxofficemojo",
  url: "https://www.boxofficemojo.com/title/tt0816692/",
  fetchedAt: "2026-10-16T00:00:00Z",
  currency: "USD",
  budget: 10_000_000,
  domesticGross: null,
  internationalGross: null,
  worldwideGross: 20_000_000,
};

describe("financial formatting", () => {
  it.each([
    [15_999_999, "$15.9m"],
    [100_999, "$100k"],
    [999_999, "$999k"],
    [1_000_000, "$1m"],
    [1_234_567_890, "$1.23b"],
    [-15_899_999, "-$15.9m"],
    [0, "$0"],
    [999, "$999"],
    [null, "\u2013"],
  ])("rounds %s down to three significant digits: %s", (input, output) => {
    expect(compactMoney(input)).toBe(output);
  });

  it("handles floating point boundaries", () => {
    expect(floorThreeDigits(15.9)).toBe(15.9);
    expect(floorThreeDigits(1.13)).toBe(1.13);
    expect(floorThreeDigits(-1.13)).toBe(-1.13);
    expect(floorThreeDigits(0.000113)).toBe(0.000113);
    expect(floorThreeDigits(100)).toBe(100);
    expect(floorThreeDigits(-12.345)).toBe(-12.4);
  });

  it.each([
    [1.999, "1.99x"],
    [2, "2x"],
    [2.019, "2x"],
    [2.999, "2.9x"],
    [8.2, "8.2x"],
    [10, "10x"],
    [10.1, "10x"],
    [19.99, "19x"],
  ])("clips multiplier %s to magnitude-dependent precision: %s", (input, output) => {
    expect(formatMultiplier(input)).toBe(output);
  });
});

describe("financial calculations and colors", () => {
  it("shows 1x net return for a movie grossing twice its budget", () => {
    expect(boxOfficeMetrics(data)).toMatchObject({
      verb: "Made",
      budget: { value: "$10m" },
      multiplier: { value: "1x", score: 1 },
      net: { value: "$10m", score: 1 },
    });
  });

  it("shows losses in red and break-even neutral", () => {
    expect(boxOfficeMetrics({ ...data, worldwideGross: 0 })).toMatchObject({
      verb: "Lost",
      multiplier: { value: "-1x", score: 0 },
      net: { value: "$10m", score: 0 },
    });
    expect(boxOfficeMetrics({ ...data, worldwideGross: data.budget })).toMatchObject({
      verb: "Made",
      multiplier: { value: "0x", score: 0.5 },
      net: { value: "$0", score: 0.5 },
    });
  });

  it("never computes returns from missing or zero budgets", () => {
    const missing = { value: "\u2013", score: null };
    expect(boxOfficeMetrics({ ...data, budget: null })).toEqual({
      missing: true, verb: "Net", budget: missing, net: missing, multiplier: missing,
    });
    expect(boxOfficeMetrics({ ...data, budget: 0 })).toMatchObject({
      verb: "Made",
      budget: { value: "$0" },
      net: { value: "$20m", score: null },
      multiplier: missing,
    });
    expect(boxOfficeMetrics({ ...data, worldwideGross: null })).toMatchObject({
      verb: "Net", budget: { value: "$10m" }, net: missing, multiplier: missing,
    });
    expect(boxOfficeMetrics()).toEqual({
      missing: true, verb: "Net", budget: missing, net: missing, multiplier: missing,
    });
  });

  it("colors zero budget white and increasing budgets progressively greener, capped at $1bn", () => {
    const scores = [0, 1, 100_000, 1e6, 10e6, 100e6, 1e9, 2e9]
      .map((budget) => boxOfficeMetrics({ ...data, budget }).budget.score!);
    expect(scores[0]).toBe(0.5);
    expect(heat(scores[0])).toBe(heat(0.5));
    scores.slice(1, -1).forEach((score, index) => {
      expect(score).toBeGreaterThan(scores[index]);
    });
    expect(scores.every((score) => score >= 0.5 && score <= 1)).toBe(true);
    expect(scores.slice(-2)).toEqual([1, 1]);
  });

  it("rounds losses down before displaying their unsigned magnitude", () => {
    expect(boxOfficeMetrics({ ...data, worldwideGross: 1 })).toMatchObject({
      verb: "Lost",
      net: { value: "$10m" },
      multiplier: { value: "-0.99x" },
    });

  });

  it("displays 150% net return as 1.5x", () => {
    expect(boxOfficeMetrics({ ...data, worldwideGross: 25_000_000 }).multiplier.value)
      .toBe("1.5x");
  });

  it.each([
    [9_042_000, "-0.09x"],
    [10_958_000, "0.09x"],
    [9_999_999, "0x"],
    [21_300_000, "1.13x"],
    [25_999_999, "1.59x"],
  ])("clips the multiplier for gross %s to two decimal places", (worldwideGross, value) => {
    expect(boxOfficeMetrics({ ...data, worldwideGross }).multiplier.value).toBe(value);
  });

  it("clamps heat colors while keeping the comparison's existing scale", () => {
    expect(heat(-100)).toBe(heat(0));
    expect(heat(100)).toBe(heat(1));
    expect(heat(0.5)).toBe("color-mix(in srgb, #dafbe1 0%, #ffffff)");
    expect(heat(1)).toBe("color-mix(in srgb, #50d46f 100%, #7ee195)");
  });
});
