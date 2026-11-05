import { describe, expect, it } from "vitest";
import {
  accumulate,
  buildLeadBreakdown,
  buildLedger,
  buildRace,
  buildStandings,
  buildUpcoming,
  daysUntil,
  isFantasyList,
  signedMoney,
} from "./fantasy";
import { league, nomination } from "./fantasy-fixtures";

const m = 1_000_000;
const today = new Date("2026-10-16T12:00:00Z");
const standings = buildStandings(league, today);
const [maya, sam, jo] = standings.players;

describe("isFantasyList", () => {
  it.each([
    ["Our league #fantasy", true],
    ["#Fantasy", true],
    ["#horror #fantasy", true],
    ["#fantasyfootball", false],
    ["fantasy without a hash", false],
    ["", false],
    [null, false],
    [undefined, false],
  ])("%j -> %s", (description, expected) => {
    expect(isFantasyList(description)).toBe(expected);
  });
});

describe("buildStandings", () => {
  it("ranks players by total net, flops included", () => {
    expect(
      standings.players.map(({ name, net, rank }) => [name, net, rank]),
    ).toEqual([
      ["Maya Chen", 460 * m, 1],
      ["Sam Ortiz", 150 * m, 2],
      ["Jo Park", 0, 3],
    ]);
  });

  it("sorts each player's movies from biggest gain to biggest loss", () => {
    expect(maya.movies.map(({ title }) => title)).toEqual([
      "Heat Wave",
      "Mystery Date",
      "Cold Open",
    ]);
  });

  it("scores portfolios by return on the scored budget", () => {
    expect(maya.budget).toBe(190 * m);
    expect(maya.score).toBeCloseTo((460 / 190 + 1) / 2);
    expect(jo.score).toBe(0.5);
  });

  it("tells scored, unreleased and missing movies apart", () => {
    const status = Object.fromEntries(
      standings.movies.map(({ title, status }) => [title, status]),
    );
    expect(status).toMatchObject({
      "Heat Wave": "scored",
      "No Numbers": "missing",
      "Next Winter": "unreleased",
      "Mystery Date": "scored",
    });
    expect([maya.pending, sam.pending, jo.pending]).toEqual([0, 1, 1]);
  });

  it("gives tied players the same rank", () => {
    const tied = buildStandings(
      [
        nomination(1, "sam", "A", "2026-01-01", [10 * m, 20 * m]),
        nomination(2, "maya", "B", "2026-01-01", [10 * m, 20 * m]),
      ],
      today,
    );
    expect(tied.players.map(({ name, rank }) => [name, rank])).toEqual([
      ["Maya Chen", 1],
      ["Sam Ortiz", 1],
    ]);
  });

  it("keeps each player's tone the same whatever the ranking", () => {
    const flipped = buildStandings(
      [...league, nomination(9, "jo", "Smash", "2026-02-01", [1 * m, 900 * m])],
      today,
    );
    const tones = (s: typeof standings) =>
      Object.fromEntries(s.players.map(({ id, tone }) => [id, tone]));
    expect(tones(flipped)).toEqual(tones(standings));
    expect(flipped.players[0].name).toBe("Jo Park");
  });

  it("counts a movie that is out with a loss as negative so far", () => {
    const early = buildStandings(
      [nomination(1, "maya", "Opening", "2026-10-10", [200 * m, 40 * m])],
      today,
    );
    expect(early.players[0].net).toBe(-160 * m);
  });

  it("reports the stalest fetch time", () => {
    const stale = buildStandings(
      [
        nomination(1, "maya", "A", null, [1, 2], "2026-10-12T00:00:00Z"),
        nomination(2, "sam", "B", null, [1, 2], "2026-10-01T00:00:00Z"),
        nomination(3, "sam", "C", null, null),
      ],
      today,
    );
    expect(stale.asOf).toBe("2026-10-01T00:00:00Z");
    expect(buildStandings([], today)).toMatchObject({
      players: [],
      asOf: null,
    });
  });

  it("treats a budget of zero as break-even instead of dividing by it", () => {
    const free = buildStandings(
      [nomination(1, "maya", "Free", "2026-01-01", [0, 5 * m])],
      today,
    );
    expect(free.movies[0]).toMatchObject({ net: 5 * m, multiplier: null });
    expect(free.movies[0].score).toBe(0.5);
  });

  it("ignores malformed release dates", () => {
    const odd = buildStandings(
      [nomination(1, "maya", "Odd", "soon", null)],
      today,
    );
    expect(odd.movies[0]).toMatchObject({
      releaseDate: null,
      status: "missing",
    });
  });
});

describe("accumulate", () => {
  it("preserves each item while chaining signed deltas from zero", () => {
    const items = [
      { title: "Hit", delta: 30 },
      { title: "Flop", delta: -50 },
      { title: "Break-even", delta: 0 },
      { title: "Recovery", delta: 40 },
    ];
    expect(accumulate(items)).toEqual([
      { title: "Hit", delta: 30, from: 0, to: 30 },
      { title: "Flop", delta: -50, from: 30, to: -20 },
      { title: "Break-even", delta: 0, from: -20, to: -20 },
      { title: "Recovery", delta: 40, from: -20, to: 20 },
    ]);
    expect(items.every((item) => !("from" in item) && !("to" in item))).toBe(
      true,
    );
  });

  it("returns no steps for no items", () => {
    expect(accumulate([])).toEqual([]);
  });
});

describe("buildLeadBreakdown", () => {
  it("adds up to the lead, ordered by impact", () => {
    const { lead, steps } = buildLeadBreakdown(maya, sam);
    expect(lead).toBe(310 * m);
    expect(
      steps.map(
        (step) => step.kind === "movie" && [step.movie.title, step.delta],
      ),
    ).toEqual([
      ["Heat Wave", 500 * m],
      ["Slow Burn", -300 * m],
      ["Big Flop", 150 * m],
      ["Cold Open", -50 * m],
      ["Mystery Date", 10 * m],
    ]);
    expect(steps.at(-1)?.to).toBe(lead);
  });

  it("chains the running lead from one step to the next", () => {
    const { steps } = buildLeadBreakdown(maya, sam);
    expect(steps[0].from).toBe(0);
    steps.slice(1).forEach((step, index) => {
      expect(step.from).toBe(steps[index].to);
    });
  });

  it("folds the long tail into one step without losing the total", () => {
    const { lead, steps } = buildLeadBreakdown(maya, sam, 2);
    expect(steps.map(({ kind }) => kind)).toEqual(["movie", "movie", "others"]);
    expect(steps[2]).toMatchObject({ count: 3, delta: 110 * m });
    expect(steps.at(-1)?.to).toBe(lead);
  });

  it("does not fold a single leftover", () => {
    const { steps } = buildLeadBreakdown(maya, sam, 4);
    expect(steps.map(({ kind }) => kind)).not.toContain("others");
  });

  it("works backwards for the player who is behind", () => {
    expect(buildLeadBreakdown(sam, maya).lead).toBe(-310 * m);
  });

  it("leaves out movies that have no numbers", () => {
    const { steps } = buildLeadBreakdown(sam, jo);
    expect(
      steps.flatMap((step) =>
        step.kind === "movie" ? [step.movie.title] : [],
      ),
    ).toEqual(["Slow Burn", "Big Flop"]);
  });
});

describe("buildRace", () => {
  const race = buildRace(standings);
  const series = (name: string) =>
    race.series.find(({ player }) => player.name === name)!;

  it("accumulates net by release date", () => {
    expect(
      series("Maya Chen").points.map(({ movie, cumulative }) => [
        movie.title,
        cumulative,
      ]),
    ).toEqual([
      ["Heat Wave", 500 * m],
      ["Cold Open", 450 * m],
    ]);
  });

  it("leaves out movies with no release date", () => {
    expect(
      series("Maya Chen").points.map(({ movie }) => movie.title),
    ).not.toContain("Mystery Date");
  });

  it("flags unknown and upcoming points", () => {
    expect(
      series("Sam Ortiz").points.map(({ movie, known, future }) => [
        movie.title,
        known,
        future,
      ]),
    ).toEqual([
      ["No Numbers", false, false],
      ["Slow Burn", true, false],
      ["Big Flop", true, false],
    ]);
    expect(series("Jo Park").points[0]).toMatchObject({
      known: false,
      future: true,
      cumulative: 0,
    });
  });

  it("spans the first release to the last, and always includes today", () => {
    expect(race.start).toBe(Date.parse("2026-02-01"));
    expect(race.end).toBe(Date.parse("2026-12-25"));
    expect(race.today).toBe(Date.parse("2026-10-16"));
    expect(buildRace(buildStandings([], today))).toMatchObject({
      start: race.today,
      end: race.today,
    });
  });
});

describe("buildLedger", () => {
  const titles = (sort: "net" | "return") =>
    buildLedger(standings.movies, sort).map(({ title }) => title);

  it("ranks scored movies by net", () => {
    expect(titles("net")).toEqual([
      "Heat Wave",
      "Slow Burn",
      "Mystery Date",
      "Cold Open",
      "Big Flop",
    ]);
  });

  it("ranks scored movies by return", () => {
    expect(titles("return")).toEqual([
      "Slow Burn",
      "Heat Wave",
      "Mystery Date",
      "Cold Open",
      "Big Flop",
    ]);
  });

  it("sorts a movie with no return ratio last", () => {
    const free = buildStandings(
      [
        nomination(1, "maya", "Free", null, [0, 50 * m]),
        nomination(2, "maya", "Small", null, [10 * m, 11 * m]),
      ],
      today,
    );
    expect(
      buildLedger(free.movies, "return").map(({ title }) => title),
    ).toEqual(["Small", "Free"]);
  });
});

describe("buildUpcoming", () => {
  it("splits unreleased from missing numbers", () => {
    const { unreleased, missing } = buildUpcoming(standings.movies);
    expect(unreleased.map(({ title }) => title)).toEqual(["Next Winter"]);
    expect(missing.map(({ title }) => title)).toEqual(["No Numbers"]);
  });

  it("orders unreleased movies by date", () => {
    const later = buildStandings(
      [
        nomination(1, "maya", "Zed", "2027-02-01", null),
        nomination(2, "maya", "Alpha", "2027-03-01", null),
        nomination(3, "maya", "Beta", "2026-11-01", null),
      ],
      today,
    );
    expect(
      buildUpcoming(later.movies).unreleased.map(({ title }) => title),
    ).toEqual(["Beta", "Zed", "Alpha"]);
  });
});

describe("formatting", () => {
  it("signs money", () => {
    expect([
      signedMoney(412 * m),
      signedMoney(-150 * m),
      signedMoney(0),
    ]).toEqual(["+$412m", "-$150m", "$0"]);
  });

  it("counts days to a release", () => {
    expect(daysUntil("2026-10-17", "2026-10-16")).toBe(1);
    expect(daysUntil("2026-12-25", "2026-10-16")).toBe(70);
  });
});
