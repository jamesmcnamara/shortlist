import { describe, expect, it } from "vitest";
import {
  applyView,
  parseViewState,
  toSearchParams,
  type ViewContext,
} from "./index";
import type { Nomination, RatingSource } from "@/src/db/schema";

const user = (id: string) => ({ id, name: id, email: `${id}@example.com` });

interface NominationOverrides {
  id: number;
  title?: string;
  userId?: string;
  createdAt?: string;
  runtime?: number | null;
  imdbRating?: number | null;
  ratings?: { source: RatingSource; value: number | null }[];
  year?: number | null;
  movieId?: number;
  seenBy?: string[];
}

const nomination = ({
  id,
  title = `Movie ${id}`,
  userId = "alice",
  createdAt = `2024-01-0${id}T00:00:00Z`,
  runtime = 100,
  imdbRating = 7,
  ratings,
  year = 2000,
  movieId = id,
  seenBy = [],
}: NominationOverrides): Nomination =>
  ({
    id,
    roomId: "room-1",
    userId,
    movieId,
    comment: null,
    createdAt: new Date(createdAt),
    movie: {
      id: movieId,
      tmdbId: movieId,
      details: { title, runtime, year },
      ratings: {
        services: (ratings ?? [{ source: "imdb", value: imdbRating }])
          .filter(
            (rating): rating is { source: RatingSource; value: number } =>
              rating.value !== null,
          )
          .map((rating) => ({
            ...rating,
            url: null,
            score: null,
            votes: null,
          })),
        raw: {},
      },
      createdAt: new Date(createdAt),
    },
    nomcoms: [],
    nominator: user(userId),
    seenBy: seenBy.map(user),
  }) as unknown as Nomination;

const context = (overrides: Partial<ViewContext> = {}): ViewContext => ({
  userId: "alice",
  ...overrides,
});

const ids = (nominations: Nomination[]) => nominations.map((n) => n.id);

describe("applyView sorting", () => {
  it("sorts by recency", () => {
    const list = [
      nomination({ id: 1, createdAt: "2024-01-01T00:00:00Z" }),
      nomination({ id: 2, createdAt: "2024-05-01T00:00:00Z" }),
    ];
    expect(
      ids(applyView(list, { sort: "recent", filters: [] }, context())),
    ).toEqual([2, 1]);
  });

  it("sorts by title", () => {
    const list = [
      nomination({ id: 1, title: "Zodiac" }),
      nomination({ id: 2, title: "Amadeus" }),
    ];
    expect(
      ids(applyView(list, { sort: "title", filters: [] }, context())),
    ).toEqual([2, 1]);
  });

  it("puts unknown runtimes last rather than first", () => {
    const list = [
      nomination({ id: 1, runtime: null }),
      nomination({ id: 2, runtime: 90 }),
    ];
    expect(
      ids(applyView(list, { sort: "runtime", filters: [] }, context())),
    ).toEqual([2, 1]);
  });

  it.each([
    ["rating-imdb", "imdb"],
    ["rating-letterboxd", "letterboxd"],
    ["rating-tomatoes", "tomatoes"],
    ["rating-popcorn", "popcorn"],
    ["rating-metacritic", "metacritic"],
    ["rating-rogerebert", "rogerebert"],
  ] as const)("sorts by %s and puts unrated movies last", (sort, source) => {
    const list = [
      nomination({
        id: 1,
        ratings: [{ source, value: null }],
      }),
      nomination({
        id: 2,
        ratings: [{ source, value: 6.1 }],
      }),
      nomination({
        id: 3,
        ratings: [{ source, value: 8.4 }],
      }),
    ];

    expect(ids(applyView(list, { sort, filters: [] }, context()))).toEqual([
      3, 2, 1,
    ]);
  });

  it("does not mutate the input list", () => {
    const list = [nomination({ id: 1 }), nomination({ id: 2 })];
    const snapshot = ids(list);
    applyView(list, { sort: "recent", filters: [] }, context());
    expect(ids(list)).toEqual(snapshot);
  });

  it("falls back to the filtered list for an unknown sort", () => {
    const list = [nomination({ id: 1 }), nomination({ id: 2 })];
    expect(
      ids(applyView(list, { sort: "nonsense", filters: [] }, context())),
    ).toEqual([1, 2]);
  });
});

describe("applyView filtering", () => {
  const list = [
    nomination({ id: 1, userId: "alice", movieId: 1 }),
    nomination({ id: 2, userId: "bob", movieId: 2, seenBy: ["alice"] }),
    nomination({ id: 3, userId: "carol", movieId: 3 }),
  ];

  it("filters to the viewer's own nominations", () => {
    expect(
      ids(applyView(list, { sort: "recent", filters: ["mine"] }, context())),
    ).toEqual([1]);
  });

  it("filters out movies the viewer has already seen", () => {
    const seen = [
      nomination({ id: 1 }),
      nomination({ id: 2, seenBy: ["alice"] }),
      nomination({ id: 3, seenBy: ["bob"] }),
    ];
    expect(
      ids(
        applyView(seen, { sort: "recent", filters: ["unwatched"] }, context()),
      ),
    ).toEqual([3, 1]);
  });

  it("filters to movies nobody in the room has seen", () => {
    const seen = [
      nomination({ id: 1 }),
      nomination({ id: 2, seenBy: ["bob"] }),
    ];
    expect(
      ids(
        applyView(
          seen,
          { sort: "recent", filters: ["unwatched-by-anyone"] },
          context(),
        ),
      ),
    ).toEqual([1]);
  });

  it("composes multiple filters with AND", () => {
    expect(
      ids(
        applyView(
          list,
          { sort: "recent", filters: ["mine", "unwatched"] },
          context(),
        ),
      ),
    ).toEqual([1]);
  });

  it("ignores unknown filter ids", () => {
    expect(
      ids(applyView(list, { sort: "recent", filters: ["bogus"] }, context())),
    ).toHaveLength(3);
  });
});

describe("URL state", () => {
  it("reads sort and filters from the query string", () => {
    const state = parseViewState(
      new URLSearchParams("sort=title&filters=mine,unwatched"),
    );
    expect(state).toEqual({ sort: "title", filters: ["mine", "unwatched"] });
  });

  it("falls back to newest-first for an unknown sort", () => {
    expect(parseViewState(new URLSearchParams("sort=bogus")).sort).toBe(
      "recent",
    );
  });

  it("drops unknown filter ids", () => {
    expect(
      parseViewState(new URLSearchParams("filters=mine,bogus")).filters,
    ).toEqual(["mine"]);
  });

  it("omits the default sort from the query string", () => {
    expect(toSearchParams({ sort: "recent", filters: [] }).toString()).toBe("");
  });

  it("round-trips a non-default view", () => {
    const state = { sort: "title", filters: ["mine"] };
    expect(parseViewState(toSearchParams(state))).toEqual(state);
  });
});
