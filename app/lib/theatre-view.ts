import type { TheatreSummaryWithPosterPreviews } from "./api";
import * as tags from "./tags";

export const THEATRE_SORTS = [
  { id: "title", label: "Alphabetical" },
  { id: "created", label: "Created at" },
  { id: "updated", label: "Updated at" },
] as const;

export interface TheatreViewState {
  query: string;
  sort: string;
  filters: string[];
}

export function parseTheatreView(params: URLSearchParams): TheatreViewState {
  const sort = params.get("sort");
  const filters = params
    .getAll("tag")
    .map(tags.normalize)
    .filter((tag) => tags.extract(`#${tag}`).includes(tag));
  return {
    query: params.get("q") ?? "",
    sort:
      sort && THEATRE_SORTS.some(({ id }) => id === sort) ? sort : "updated",
    filters: [...new Set(filters)].sort(),
  };
}

export function theatreViewParams(
  current: URLSearchParams,
  state: TheatreViewState,
): URLSearchParams {
  const params = new URLSearchParams(current);
  params.delete("q");
  params.delete("sort");
  params.delete("tag");
  if (state.query) params.set("q", state.query);
  if (state.sort !== "updated") params.set("sort", state.sort);
  [...new Set(state.filters)]
    .sort()
    .forEach((tag) => params.append("tag", tag));
  return params;
}

export function applyTheatreView(
  theatres: TheatreSummaryWithPosterPreviews[],
  state: TheatreViewState,
): TheatreSummaryWithPosterPreviews[] {
  const query = state.query.trim().normalize("NFC").toLowerCase();
  return theatres
    .filter(
      (theatre) =>
        theatre.name.normalize("NFC").toLowerCase().includes(query) &&
        state.filters.every((tag) => theatre.tags.includes(tag)),
    )
    .sort((a, b) => {
      const dateOrder =
        state.sort === "title"
          ? 0
          : Date.parse(state.sort === "created" ? b.createdAt : b.updatedAt) -
            Date.parse(state.sort === "created" ? a.createdAt : a.updatedAt);
      return (
        dateOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      );
    });
}
