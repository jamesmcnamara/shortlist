import type { Movie, RatingSource } from "@/src/db/schema";
import { find } from "shades";

export type Scale = "absolute" | "relative";

// Not a UI limit, just keeps a hand-crafted URL from fanning out into lots of TMDB fetches.
const MAX_URL_MOVIES = 50;

/** Reads `?tmdb=1,2,3` into unique, positive TMDB ids. */
export const parseTmdbIds = (param: string | string[] | undefined) =>
  [
    ...new Set(
      [param ?? []]
        .flat()
        .flatMap((value) => value.split(","))
        .filter((value) => /^\d{1,9}$/.test(value))
        .map(Number)
        .filter((id) => id > 0),
    ),
  ].slice(0, MAX_URL_MOVIES);

export const compareHref = (tmdbIds: number[]) =>
  tmdbIds.length > 0 ? `/compare?tmdb=${tmdbIds.join(",")}` : "/compare";

export interface Metric {
  name: string;
  logo: string | null;
  /** The full possible range, used by the absolute scale. */
  range: [number, number];
  lowerIsBetter: boolean;
  read: (movie: Movie) => number | null;
  format: (value: number) => string;
}

// Zero means "no data" for both MDBList ratings and TMDB runtimes.
const positive = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;

const rating = (source: RatingSource) => (movie: Movie) =>
  positive(find({ source })(movie.ratings?.services)?.value);

const formatRuntime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
};

export const METRICS: Metric[] = [
  {
    name: "IMDb",
    logo: "/ratings/imdb.svg",
    range: [3, 9],
    lowerIsBetter: false,
    read: rating("imdb"),
    format: (value) => value.toFixed(1),
  },
  {
    name: "Letterboxd",
    logo: "/ratings/letterboxd.svg",
    range: [1.5, 4.6],
    lowerIsBetter: false,
    read: rating("letterboxd"),
    format: (value) => value.toFixed(1),
  },
  {
    name: "Rotten Tomatoes",
    logo: "/ratings/rottentomatoes.svg",
    range: [0, 100],
    lowerIsBetter: false,
    read: rating("tomatoes"),
    format: (value) => `${Math.round(value)}%`,
  },
  {
    name: "Rotten Tomatoes audience",
    logo: "/ratings/rottentomatoes-popcorn.svg",
    range: [0, 100],
    lowerIsBetter: false,
    read: rating("popcorn"),
    format: (value) => `${Math.round(value)}%`,
  },
  {
    name: "Runtime",
    logo: null,
    range: [80, 180],
    lowerIsBetter: true,
    read: (movie) => positive(movie.details?.runtime),
    format: (value) => formatRuntime(Math.round(value)),
  },
];

export type SortDirection = "desc" | "asc";

/** Orders movies by a metric's raw value. Missing values always go last. */
export const sortMovies = (
  movies: Movie[],
  metric: Pick<Metric, "read">,
  direction: SortDirection,
) => {
  const sign = direction === "desc" ? -1 : 1;
  return movies
    .map((movie) => ({ movie, value: metric.read(movie) }))
    .toSorted((a, b) =>
      a.value === null || b.value === null
        ? Number(a.value === null) - Number(b.value === null)
        : sign * (a.value - b.value),
    )
    .map(({ movie }) => movie);
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * How good each value is, from 0 (worst) to 1 (best), or null when there's
 * nothing to color. Relative scoring needs at least two values to compare;
 * when they're all tied, they all count as best.
 */
export const scoreRow = (
  values: (number | null)[],
  metric: Pick<Metric, "range" | "lowerIsBetter">,
  scale: Scale,
): (number | null)[] => {
  const present = values.filter((value): value is number => value !== null);
  const [low, high] =
    scale === "absolute"
      ? metric.range
      : [Math.min(...present), Math.max(...present)];
  const canScore = scale === "absolute" || present.length >= 2;

  return values.map((value) => {
    if (value === null || !canScore) return null;
    if (high === low) return 1;
    const position = clamp((value - low) / (high - low));
    return metric.lowerIsBetter ? 1 - position : position;
  });
};
