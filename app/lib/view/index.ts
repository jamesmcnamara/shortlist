import type { Nomination, Room } from "@/src/db/schema";

/**
 * Everything a sort or filter may depend on. Options read from here rather
 * than closing over component state, so they stay pure and testable.
 */
export interface ViewContext {
  room: Pick<Room, "cycleLength">;
  currentCycle: number;
  userId?: string;
  watchedMovieIds: ReadonlySet<number>;
}

export interface SortOption {
  id: string;
  label: string;
  compare: (a: Nomination, b: Nomination, context: ViewContext) => number;
}

export interface FilterOption {
  id: string;
  label: string;
  predicate: (nomination: Nomination, context: ViewContext) => boolean;
}

export interface ViewState {
  sort: string;
  filters: string[];
}

const byNumberDesc = (a: number |  undefined, b: number | undefined) =>
  (b ?? -Infinity) - (a ?? -Infinity);

const time = (date: Date | string) => new Date(date).getTime();

const imdbRating = ({ ratings }: Nomination["movie"]) =>
  ratings.services.find(({ source }) => source === "imdb")?.value ?? undefined;

export const SORTS: SortOption[] = [
  {
    id: "votes",
    label: "Most votes",
    compare: (a, b) =>
      b.votes.length - a.votes.length || time(b.createdAt) - time(a.createdAt),
  },
  {
    id: "recent",
    label: "Recently added",
    compare: (a, b) => time(b.createdAt) - time(a.createdAt),
  },
  {
    id: "title",
    label: "Title",
    compare: (a, b) => a.movie.details.title.localeCompare(b.movie.details.title),
  },
  {
    id: "runtime",
    label: "Shortest first",
    compare: (a, b) =>
      (a.movie.details.runtime ?? Infinity) - (b.movie.details.runtime ?? Infinity),
  },
  {
    id: "rating",
    label: "Highest rated",
    compare: (a, b) => byNumberDesc(imdbRating(a.movie), imdbRating(b.movie)),
  },
  {
    id: "year",
    label: "Newest release",
    compare: (a, b) => byNumberDesc(a.movie.details.year, b.movie.details.year),
  },
];

export const FILTERS: FilterOption[] = [
  {
    id: "unwatched",
    label: "Not yet watched",
    predicate: (nomination, { watchedMovieIds }) =>
      !watchedMovieIds.has(nomination.movieId),
  },
  {
    id: "mine",
    label: "My nominations",
    predicate: (nomination, { userId }) => nomination.userId === userId,
  },
  {
    id: "voted",
    label: "I voted for",
    predicate: (nomination, { userId }) =>
      nomination.votes.some((vote) => vote.userId === userId),
  },
  {
    id: "unvoted",
    label: "I have not voted for",
    predicate: (nomination, { userId }) =>
      !nomination.votes.some((vote) => vote.userId === userId),
  },
  {
    id: "current-cycle",
    label: "This cycle",
    predicate: (nomination, { currentCycle }) =>
      nomination.cycle === currentCycle,
  },
];

const byId = <T extends { id: string }>(options: T[]) =>
  new Map(options.map((option) => [option.id, option]));

export const SORTS_BY_ID = byId(SORTS);
export const FILTERS_BY_ID = byId(FILTERS);

/** A room that never resets has no meaningful "this cycle". */
export const availableFilters = (context: ViewContext): FilterOption[] =>
  FILTERS.filter(
    (filter) =>
      filter.id !== "current-cycle" || context.room.cycleLength !== "never",
  );

export const defaultViewState = (
  room: Pick<Room, "cycleLength">,
): ViewState => ({
  sort: room.cycleLength === "never" ? "recent" : "votes",
  filters: [],
});

/**
 * Filters then sorts, without mutating the input. Unknown ids are ignored so a
 * stale URL cannot break the page.
 */
export function applyView(
  nominations: Nomination[],
  state: ViewState,
  context: ViewContext,
): Nomination[] {
  const filters = state.filters
    .map((id) => FILTERS_BY_ID.get(id))
    .filter((filter): filter is FilterOption => Boolean(filter));

  const filtered = nominations.filter((nomination) =>
    filters.every((filter) => filter.predicate(nomination, context)),
  );

  const sort = SORTS_BY_ID.get(state.sort);
  if (!sort) return filtered;

  return [...filtered].sort((a, b) => sort.compare(a, b, context));
}

export function parseViewState(
  params: URLSearchParams,
  room: Pick<Room, "cycleLength">,
): ViewState {
  const fallback = defaultViewState(room);
  const sort = params.get("sort");
  const filters = (params.get("filters") ?? "")
    .split(",")
    .filter((id) => FILTERS_BY_ID.has(id));

  return {
    sort: sort && SORTS_BY_ID.has(sort) ? sort : fallback.sort,
    filters,
  };
}

export function toSearchParams(
  state: ViewState,
  room: Pick<Room, "cycleLength">,
): URLSearchParams {
  const params = new URLSearchParams();
  const fallback = defaultViewState(room);
  if (state.sort !== fallback.sort) params.set("sort", state.sort);
  if (state.filters.length) params.set("filters", state.filters.join(","));
  return params;
}
