import type { Nomination, RatingSource } from "@/src/db/schema";
import { STREAMING_SERVICES } from "../streaming-services";
import { some } from "shades";

/**
 * Everything a sort or filter may depend on. Options read from here rather
 * than closing over component state, so they stay pure and testable.
 */
export interface ViewContext {
  userId?: string;
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

const byNumberDesc = (
  a: number | null | undefined,
  b: number | null | undefined,
) => (b ?? -Infinity) - (a ?? -Infinity);

const time = (date: Date | string) => new Date(date).getTime();

const serviceRating =
  (source: RatingSource) =>
  ({ ratings }: Nomination["movie"]) =>
    ratings.services.find((rating) => rating.source === source)?.value ??
    undefined;

const ratingSort = (source: RatingSource, label: string): SortOption => ({
  id: `rating-${source}`,
  label,
  compare: (a, b) =>
    byNumberDesc(
      serviceRating(source)(a.movie),
      serviceRating(source)(b.movie),
    ),
});

export const SORTS: SortOption[] = [
  {
    id: "recent",
    label: "Recently added",
    compare: (a, b) => time(b.createdAt) - time(a.createdAt),
  },
  {
    id: "title",
    label: "Title",
    compare: (a, b) =>
      a.movie.details.title.localeCompare(b.movie.details.title),
  },
  {
    id: "runtime",
    label: "Shortest first",
    compare: (a, b) =>
      (a.movie.details.runtime ?? Infinity) -
      (b.movie.details.runtime ?? Infinity),
  },
  ratingSort("letterboxd", "Letterboxd"),
  ratingSort("tomatoes", "RT critics"),
  ratingSort("popcorn", "RT audience"),
  ratingSort("imdb", "IMDb"),
  ratingSort("metacritic", "Metacritic"),
  ratingSort("rogerebert", "Roger Ebert"),
  {
    id: "year",
    label: "Newest release",
    compare: (a, b) => byNumberDesc(a.movie.details.year, b.movie.details.year),
  },
];

export const FILTERS: FilterOption[] = [
  {
    id: "unwatched",
    label: "I have not seen",
    predicate: (nomination, { userId }) =>
      !nomination.seenBy.some((user) => user.id === userId),
  },
  {
    id: "unwatched-by-anyone",
    label: "Nobody has seen",
    predicate: (nomination) => nomination.seenBy.length === 0,
  },
  {
    id: "mine",
    label: "My nominations",
    predicate: (nomination, { userId }) => nomination.userId === userId,
  },
  {
    id: "not-mine",
    label: "Nominated by others",
    predicate: (nomination, { userId }) => nomination.userId !== userId,
  },
  {
    id: "streaming-available",
    label: "Free to stream",
    predicate: (nomination) =>
      !!some({
        type: "FLATRATE",
        packageId: inServiceIds,
      })(nomination.movie.details?.justWatch?.offers ?? []),
  },
];

const SERVICE_IDS = new Set(
  STREAMING_SERVICES.flatMap((service) => service.packageIds),
);

const inServiceIds = SERVICE_IDS.has.bind(SERVICE_IDS);

const byId = <T extends { id: string }>(options: T[]) =>
  new Map(options.map((option) => [option.id, option]));

export const SORTS_BY_ID = byId(SORTS);
export const FILTERS_BY_ID = byId(FILTERS);

export const DEFAULT_VIEW_STATE: ViewState = { sort: "recent", filters: [] };

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

export function parseViewState(params: URLSearchParams): ViewState {
  const sort = params.get("sort");
  const filters = (params.get("filters") ?? "")
    .split(",")
    .filter((id) => FILTERS_BY_ID.has(id));

  return {
    sort: sort && SORTS_BY_ID.has(sort) ? sort : DEFAULT_VIEW_STATE.sort,
    filters,
  };
}

export function toSearchParams(state: ViewState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.sort !== DEFAULT_VIEW_STATE.sort) params.set("sort", state.sort);
  if (state.filters.length) params.set("filters", state.filters.join(","));
  return params;
}
