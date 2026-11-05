import type { Nomination, Person } from "@/src/db/schema";
import type { BoxOfficeData } from "./box-office";
import {
  boxOfficeMetrics,
  calculateReturns,
  compactMoney,
} from "./box-office-metrics";
import { extract } from "./tags";
import { orderBy, sumBy, uniqBy } from "lodash";

const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isFantasyList = (description?: string | null) =>
  !!description && extract(description).includes("fantasy");

export const signedMoney = (value: number) =>
  `${value > 0 ? "+" : ""}${compactMoney(value)}`;

export interface FantasyMovie {
  /** Nomination id, which is what the discussion opens on. */
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  ownerId: string;
  boxOffice?: BoxOfficeData;
  /**
   * scored: has budget and worldwide gross
   * unreleased: no numbers yet and not out yet
   * missing: no numbers, but it should be out
   */
  status: "scored" | "unreleased" | "missing";
  /** Zero until scored, so sums never need a null check. */
  net: number;
  budget: number;
  multiplier: number | null;
  /** Heat score (0 is red, 0.5 is break-even, 1 is green). */
  score: number;
}

export interface FantasyPlayer extends Person {
  /** Stable position within the list, for picking a color that never moves. */
  tone: number;
  rank: number;
  /** Highest net first, so the biggest loss comes last. */
  movies: FantasyMovie[];
  net: number;
  budget: number;
  /** Heat score for the whole portfolio. */
  score: number;
  /** Movies with no numbers yet. */
  pending: number;
}

export type FantasyStandings = {
  today: string;
  players: FantasyPlayer[];
  movies: FantasyMovie[];
  /** When the stalest box office figure was fetched. */
  asOf: string | null;
};

const portfolioScore = (net: number, budget: number) =>
  budget > 0 ? (net / budget + 1) / 2 : 0.5;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

const toMovie =
  (today: string) =>
  ({ id, nominator, movie }: Nomination): FantasyMovie => {
    const { details } = movie;
    const returns = calculateReturns(details.boxOffice);
    const releaseDate = ISO_DAY.test(details.release_date ?? "")
      ? details.release_date
      : null;
    return {
      id,
      title: details.title,
      posterUrl: details.posterUrl ?? null,
      releaseDate,
      ownerId: nominator.id,
      boxOffice: details.boxOffice,
      status: returns
        ? "scored"
        : releaseDate && releaseDate > today
          ? "unreleased"
          : "missing",
      net: returns?.net ?? 0,
      budget: returns ? (details.boxOffice?.budget ?? 0) : 0,
      multiplier: returns?.multiplier ?? null,
      score: boxOfficeMetrics(details.boxOffice).net.score ?? 0.5,
    };
  };

const isScored = (movie: FantasyMovie) => movie.status === "scored";

export function buildStandings(
  nominees: Nomination[],
  now = new Date(),
): FantasyStandings {
  const today = isoDay(now);
  const movies = nominees.map(toMovie(today));
  const owners = orderBy(
    uniqBy(
      nominees.map(({ nominator }) => nominator),
      "id",
    ),
    "id",
  );

  const totals = owners.map((owner, tone) => {
    const mine = orderBy(
      movies.filter(({ ownerId }) => ownerId === owner.id),
      ["net", "title"],
      ["desc", "asc"],
    );
    const scored = mine.filter(isScored);
    const net = sumBy(scored, "net");
    const budget = sumBy(scored, "budget");
    return {
      ...owner,
      tone,
      movies: mine,
      net,
      budget,
      score: portfolioScore(net, budget),
      pending: mine.length - scored.length,
    };
  });

  const players = orderBy(
    totals,
    ["net", "name", "id"],
    ["desc", "asc", "asc"],
  ).map((player) => ({
    ...player,
    rank: 1 + totals.filter(({ net }) => net > player.net).length,
  }));

  const fetchedAt = movies
    .filter(isScored)
    .map(({ boxOffice }) => boxOffice?.fetchedAt)
    .filter((value): value is string => !!value && !isNaN(Date.parse(value)));

  return {
    today,
    players,
    movies,
    asOf: orderBy(fetchedAt, (value) => Date.parse(value))[0] ?? null,
  };
}

type StepKind =
  | { kind: "movie"; movie: FantasyMovie; ownerId: string }
  | { kind: "others"; count: number };

export type LeadStep = StepKind & {
  delta: number;
  /** The running lead before and after this step. */
  from: number;
  to: number;
};

export interface LeadBreakdown {
  lead: number;
  steps: LeadStep[];
}

export const accumulate = <T extends { delta: number }>(items: T[]) =>
  items.reduce<(T & { from: number; to: number })[]>((steps, item) => {
    const from = steps.at(-1)?.to ?? 0;
    return [...steps, { ...item, from, to: from + item.delta }];
  }, []);

/** How `a` leads `b`, movie by movie. The steps always add up to the lead. */
export function buildLeadBreakdown(
  a: FantasyPlayer,
  b: FantasyPlayer,
  maxMovies = 5,
): LeadBreakdown {
  const contributions = orderBy(
    [
      ...a.movies
        .filter(isScored)
        .map((movie) => ({ movie, ownerId: a.id, delta: movie.net })),
      ...b.movies
        .filter(isScored)
        .map((movie) => ({ movie, ownerId: b.id, delta: -movie.net })),
    ].filter(({ delta }) => delta !== 0),
    [({ delta }) => Math.abs(delta), ({ movie }) => movie.title],
    ["desc", "asc"],
  );

  // A lone leftover would read better as itself than as "1 other".
  const split =
    contributions.length > maxMovies + 1 ? maxMovies : contributions.length;
  const shown = contributions.slice(0, split);
  const rest = contributions.slice(split);

  const steps: (StepKind & { delta: number })[] = [
    ...shown.map((item) => ({ kind: "movie" as const, ...item })),
    ...(rest.length > 0
      ? [
          {
            kind: "others" as const,
            count: rest.length,
            delta: sumBy(rest, "delta"),
          },
        ]
      : []),
  ];

  return { lead: a.net - b.net, steps: accumulate(steps) };
}

export interface RacePoint {
  movie: FantasyMovie;
  time: number;
  /** The player's total net once this movie is out. */
  cumulative: number;
  /** False when the movie has no box office numbers to count. */
  known: boolean;
  /** Releases after today. */
  future: boolean;
}

export interface Race {
  series: { player: FantasyPlayer; points: RacePoint[] }[];
  start: number;
  end: number;
  today: number;
}

/** Cumulative net by release date. Movies with no release date can't race. */
export function buildRace({ players, today }: FantasyStandings): Race {
  const now = Date.parse(today);
  const series = players.map((player) => ({
    player,
    points: accumulate(
      orderBy(
        player.movies.filter(({ releaseDate }) => releaseDate),
        ["releaseDate", "title"],
      ).map((movie) => ({
        movie,
        time: Date.parse(movie.releaseDate!),
        delta: movie.net,
      })),
    ).map(({ movie, time, to }): RacePoint => ({
      movie,
      time,
      cumulative: to,
      known: isScored(movie),
      future: time > now,
    })),
  }));
  const times = series.flatMap(({ points }) => points.map(({ time }) => time));
  return {
    series,
    start: times.length > 0 ? Math.min(...times) : now,
    end: Math.max(now, ...times),
    today: now,
  };
}

export type LedgerSort = "net" | "return";

export const buildLedger = (movies: FantasyMovie[], sort: LedgerSort) =>
  orderBy(
    movies.filter(isScored),
    sort === "net"
      ? ["net", "title"]
      : [({ multiplier }) => multiplier ?? -Infinity, "title"],
    ["desc", "asc"],
  );

export const buildUpcoming = (movies: FantasyMovie[]) => ({
  unreleased: orderBy(
    movies.filter(({ status }) => status === "unreleased"),
    ["releaseDate", "title"],
  ),
  missing: orderBy(
    movies.filter(({ status }) => status === "missing"),
    "title",
  ),
});

export const daysUntil = (date: string, today: string) =>
  Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS);
