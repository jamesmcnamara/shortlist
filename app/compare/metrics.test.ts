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
    ]);
  });

  it("formats runtimes as hours and minutes", () => {
    const runtimeMetric = METRICS.find(({ name }) => name === "Runtime")!;
    expect(runtimeMetric.format(125)).toBe("2h 5m");
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
