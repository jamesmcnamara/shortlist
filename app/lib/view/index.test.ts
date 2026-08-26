import { describe, expect, it } from "vitest";
import {
  applyView,
  availableFilters,
  defaultViewState,
  parseViewState,
  toSearchParams,
  type ViewContext,
} from "./index";
import type { Nomination } from "@/src/db/schema";

const user = (id: string) => ({ id, name: id, email: `${id}@example.com` });

interface NominationOverrides {
  id: number;
  title?: string;
  votes?: string[];
  userId?: string;
  cycle?: number;
  createdAt?: string;
  runtime?: number | null;
  imdbRating?: number | null;
  year?: number | null;
  movieId?: number;
  seenBy?: string[];
}

const nomination = ({
  id,
  title = `Movie ${id}`,
  votes = [],
  userId = "alice",
  cycle = 0,
  createdAt = `2024-01-0${id}T00:00:00Z`,
  runtime = 100,
  imdbRating = 7,
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
    cycle,
    createdAt: new Date(createdAt),
    movie: {
      id: movieId,
      tmdbId: movieId,
      details: { title, runtime, year },
      ratings: {
        services:
          imdbRating === null
            ? []
            : [
                {
                  source: "imdb",
                  value: imdbRating,
                  url: null,
                  score: null,
                  votes: null,
                },
              ],
        raw: {},
      },
      createdAt: new Date(createdAt),
    },
    votes: votes.map((voterId, index) => ({
      id: index,
      roomId: "room-1",
      userId: voterId,
      nominationId: id,
      cycle,
      comment: null,
      createdAt: new Date(createdAt),
      voter: user(voterId),
    })),
    nomcoms: [],
    nominator: user(userId),
    seenBy: seenBy.map(user),
  }) as unknown as Nomination;

const context = (overrides: Partial<ViewContext> = {}): ViewContext => ({
  room: { cycleLength: "month" },
  currentCycle: 0,
  userId: "alice",
  ...overrides,
});

const ids = (nominations: Nomination[]) => nominations.map((n) => n.id);

describe("applyView sorting", () => {
  it("ranks by vote count", () => {
    const list = [
      nomination({ id: 1, votes: ["bob"] }),
      nomination({ id: 2, votes: ["bob", "carol", "dave"] }),
      nomination({ id: 3, votes: [] }),
    ];
    expect(
      ids(applyView(list, { sort: "votes", filters: [] }, context())),
    ).toEqual([2, 1, 3]);
  });

  it("counts stacked votes from one person separately", () => {
    const list = [
      nomination({ id: 1, votes: ["bob", "bob", "bob"] }),
      nomination({ id: 2, votes: ["bob", "carol"] }),
    ];
    expect(
      ids(applyView(list, { sort: "votes", filters: [] }, context())),
    ).toEqual([1, 2]);
  });

  it("breaks vote ties with the newer nomination first", () => {
    const list = [
      nomination({ id: 1, votes: ["bob"], createdAt: "2024-01-01T00:00:00Z" }),
      nomination({ id: 2, votes: ["bob"], createdAt: "2024-03-01T00:00:00Z" }),
    ];
    expect(
      ids(applyView(list, { sort: "votes", filters: [] }, context())),
    ).toEqual([2, 1]);
  });

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

  it("puts unrated movies last when sorting by rating", () => {
    const list = [
      nomination({ id: 1, imdbRating: null }),
      nomination({ id: 2, imdbRating: 6.1 }),
    ];
    expect(
      ids(applyView(list, { sort: "rating", filters: [] }, context())),
    ).toEqual([2, 1]);
  });

  it("does not mutate the input list", () => {
    const list = [nomination({ id: 1 }), nomination({ id: 2, votes: ["bob"] })];
    const snapshot = ids(list);
    applyView(list, { sort: "votes", filters: [] }, context());
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
    nomination({ id: 1, userId: "alice", votes: ["bob"], movieId: 1 }),
    nomination({ id: 2, userId: "bob", votes: ["alice"], movieId: 2 }),
    nomination({ id: 3, userId: "carol", votes: [], movieId: 3, cycle: 1 }),
  ];

  it("filters to the viewer's own nominations", () => {
    expect(
      ids(applyView(list, { sort: "recent", filters: ["mine"] }, context())),
    ).toEqual([1]);
  });

  it("filters to nominations the viewer voted for", () => {
    expect(
      ids(applyView(list, { sort: "recent", filters: ["voted"] }, context())),
    ).toEqual([2]);
  });

  it("filters out movies the viewer has already seen", () => {
    const seen = [
      nomination({ id: 1 }),
      nomination({ id: 2, seenBy: ["alice"] }),
      nomination({ id: 3, seenBy: ["bob"] }),
    ];
    expect(
      ids(applyView(seen, { sort: "recent", filters: ["unwatched"] }, context())),
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

  it("filters to the current cycle", () => {
    expect(
      ids(
        applyView(
          list,
          { sort: "recent", filters: ["current-cycle"] },
          context({ currentCycle: 1 }),
        ),
      ),
    ).toEqual([3]);
  });

  it("composes multiple filters with AND", () => {
    expect(
      ids(
        applyView(
          list,
          { sort: "recent", filters: ["mine", "unvoted"] },
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

describe("availableFilters", () => {
  it("offers the cycle filter to rooms that reset", () => {
    const options = availableFilters(context()).map((f) => f.id);
    expect(options).toContain("current-cycle");
  });

  it("hides the cycle filter from rooms that never reset", () => {
    const options = availableFilters(
      context({ room: { cycleLength: "never" } }),
    ).map((f) => f.id);
    expect(options).not.toContain("current-cycle");
  });
});

describe("defaultViewState", () => {
  it("ranks a club by votes", () => {
    expect(defaultViewState({ cycleLength: "month" }).sort).toBe("votes");
  });

  it("shows a watch list newest-first", () => {
    expect(defaultViewState({ cycleLength: "never" }).sort).toBe("recent");
  });
});

describe("URL state", () => {
  const club = { cycleLength: "month" } as const;

  it("reads sort and filters from the query string", () => {
    const state = parseViewState(
      new URLSearchParams("sort=title&filters=mine,voted"),
      club,
    );
    expect(state).toEqual({ sort: "title", filters: ["mine", "voted"] });
  });

  it("falls back to the room default for an unknown sort", () => {
    expect(parseViewState(new URLSearchParams("sort=bogus"), club).sort).toBe(
      "votes",
    );
  });

  it("drops unknown filter ids", () => {
    expect(
      parseViewState(new URLSearchParams("filters=mine,bogus"), club).filters,
    ).toEqual(["mine"]);
  });

  it("omits the default sort from the query string", () => {
    expect(
      toSearchParams({ sort: "votes", filters: [] }, club).toString(),
    ).toBe("");
  });

  it("round-trips a non-default view", () => {
    const state = { sort: "title", filters: ["mine"] };
    expect(parseViewState(toSearchParams(state, club), club)).toEqual(state);
  });
});
