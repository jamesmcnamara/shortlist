import { describe, expect, it } from "vitest";
import type { Movie } from "@/src/db/schema";
import {
  compareHref,
  METRICS,
  parseTmdbIds,
  scoreRow,
  sortMovies,
} from "./metrics";

const higher = { range: [0, 10] as [number, number], lowerIsBetter: false };
const runtime = { range: [80, 180] as [number, number], lowerIsBetter: true };

describe("scoreRow", () => {
  it("ranks relative to the other movies", () => {
    expect(scoreRow([6, 8, 7], higher, "relative")).toEqual([0, 1, 0.5]);
  });

  it("scores against the full range when absolute", () => {
    expect(scoreRow([6, 8], higher, "absolute")).toEqual([0.6, 0.8]);
  });

  it("treats shorter runtimes as better", () => {
    expect(scoreRow([90, 150], runtime, "relative")).toEqual([1, 0]);
    expect(scoreRow([80, 130, 180], runtime, "absolute")).toEqual([1, 0.5, 0]);
  });

  it("clamps runtimes outside the absolute range", () => {
    expect(scoreRow([60, 240], runtime, "absolute")).toEqual([1, 0]);
  });

  it("leaves missing values unscored without skewing the rest", () => {
    expect(scoreRow([5, null, 9], higher, "relative")).toEqual([0, null, 1]);
  });

  it("needs two values to compare relatively", () => {
    expect(scoreRow([7], higher, "relative")).toEqual([null]);
    expect(scoreRow([7, null], higher, "relative")).toEqual([null, null]);
    expect(scoreRow([7], higher, "absolute")).toEqual([0.7]);
  });

  it("calls a tie the best", () => {
    expect(scoreRow([7, 7], higher, "relative")).toEqual([1, 1]);
  });
});

describe("METRICS", () => {
  const movie = {
    details: { runtime: 0 },
    ratings: {
      raw: {},
      services: [
        { source: "imdb", value: 7.4, url: null, score: null, votes: null },
        { source: "tomatoes", value: 0, url: null, score: null, votes: null },
      ],
    },
  } as unknown as Movie;

  it("reads ratings and treats zeros as missing", () => {
    expect(METRICS.map((metric) => metric.read(movie))).toEqual([
      7.4,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("formats runtimes as hours and minutes", () => {
    const runtimeMetric = METRICS.find(({ name }) => name === "Runtime")!;
    expect(runtimeMetric.format(125)).toBe("2h 5m");
  });

  const totalReturn = METRICS.find(({ name }) => name === "Total return")!;
  const multiplier = METRICS.find(({ name }) => name === "Return multiplier")!;
  const financialMovie = (
    budget: number | null,
    worldwideGross: number | null,
  ): Movie => ({
    ...movie,
    details: {
      ...movie.details,
      boxOffice: {
        source: "boxofficemojo",
        currency: "USD",
        url: "https://www.boxofficemojo.com/title/tt0816692/",
        fetchedAt: "2026-10-16T00:00:00Z",
        domesticGross: null,
        internationalGross: null,
        budget,
        worldwideGross,
      },
    },
  });

  it("reads signed net returns and clips multipliers without losing raw sort precision", () => {
    const loss = financialMovie(10_000_000, 9_042_000);
    expect(totalReturn.read(loss)).toBe(-958_000);
    expect(totalReturn.format(totalReturn.read(loss)!)).toBe("-$958k");
    expect(multiplier.read(loss)).toBe(-0.0958);
    expect(multiplier.format(multiplier.read(loss)!)).toBe("-0.09x");
    expect(totalReturn.read(financialMovie(10, 10))).toBe(0);
  });

  it("leaves unknown returns missing and only omits the multiplier for zero budgets", () => {
    expect(totalReturn.read(financialMovie(null, 100))).toBeNull();
    expect(multiplier.read(financialMovie(100, null))).toBeNull();
    expect(totalReturn.read(financialMovie(0, 100))).toBe(100);
    expect(multiplier.read(financialMovie(0, 100))).toBeNull();
  });

  it("uses dollar returns for absolute net colors and return on budget for multiplier colors", () => {
    const movies = [
      financialMovie(10, 0),
      financialMovie(10, 10),
      financialMovie(10, 20),
    ];
    const dollarReturns = [
      -200_000_000, -100_000_000, -50_000_000, 0, 50_000_000, 100_000_000,
      200_000_000,
    ];
    expect(scoreRow(dollarReturns, totalReturn, "absolute")).toEqual([
      0, 0, 0.25, 0.5, 0.75, 1, 1,
    ]);
    expect(
      scoreRow(movies.map(multiplier.read), multiplier, "absolute"),
    ).toEqual([0, 0.5, 1]);
  });

  it("sorts financial rows by unrounded values with missing entries last", () => {
    const loss = { ...financialMovie(10, 5), id: 1 };
    const gain = { ...financialMovie(10, 25), id: 2 };
    const missing = { ...financialMovie(null, 25), id: 3 };
    expect(
      sortMovies([missing, loss, gain], totalReturn, "desc").map(
        ({ id }) => id,
      ),
    ).toEqual([2, 1, 3]);
    expect(
      scoreRow(
        [totalReturn.read(loss), totalReturn.read(gain)],
        totalReturn,
        "relative",
      ),
    ).toEqual([0, 1]);
  });
});

describe("parseTmdbIds", () => {
  it("keeps valid unique ids in order", () => {
    expect(parseTmdbIds("12,7,12,3")).toEqual([12, 7, 3]);
  });

  it("drops junk, zero, negatives, and oversized ids", () => {
    expect(parseTmdbIds("abc,0,-4,1.5,1234567890,,42, 9")).toEqual([42]);
  });

  it("keeps lots of ids but stops at a sane ceiling", () => {
    const ids = Array.from({ length: 80 }, (_, i) => i + 1);
    expect(parseTmdbIds(ids.slice(0, 12).join(","))).toHaveLength(12);
    expect(parseTmdbIds(ids.join(","))).toHaveLength(50);
  });

  it("handles a missing param", () => {
    expect(parseTmdbIds(undefined)).toEqual([]);
  });
});

describe("compareHref", () => {
  it("builds a query when there are ids", () => {
    expect(compareHref([1, 2])).toBe("/compare?tmdb=1,2");
  });

  it("drops the query when empty", () => {
    expect(compareHref([])).toBe("/compare");
  });
});

describe("sortMovies", () => {
  const byValue = {
    read: (movie: Movie) => (movie.id === 4 ? null : movie.id % 10),
  };
  const movies = [13, 4, 31, 22, 3].map((id) => ({ id }) as Movie);
  const ids = (list: Movie[]) => list.map(({ id }) => id);

  it("sorts highest first, keeping ties in order and missing last", () => {
    expect(ids(sortMovies(movies, byValue, "desc"))).toEqual([
      13, 3, 22, 31, 4,
    ]);
  });

  it("sorts lowest first with missing still last", () => {
    expect(ids(sortMovies(movies, byValue, "asc"))).toEqual([31, 22, 13, 3, 4]);
  });
});
