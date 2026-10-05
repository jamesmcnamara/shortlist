import { api, ApiError } from "@/app/lib/api";
import type { Movie } from "@/src/db/schema";
import useSWRImmutable from "swr/immutable";
import { useDebounce } from "use-debounce";

const MIN_QUERY_LENGTH = 2;

export interface MovieSearchResult {
  results: Movie[];
  error: string;
  isLoading: boolean;
}

const searchKey = (query: string) =>
  query.length >= MIN_QUERY_LENGTH
    ? `/api/tmdb/search?query=${encodeURIComponent(query)}`
    : null;

/** Debounced, cached TMDB search. */
export function useMovieSearch(query: string): MovieSearchResult {
  const trimmed = query.trim();
  const [debounced] = useDebounce(trimmed, 350);
  const { data, error, isLoading } = useSWRImmutable<Movie[], Error>(
    searchKey(debounced),
    () => api.tmdb.search(debounced),
  );

  const isActive = trimmed.length >= MIN_QUERY_LENGTH;
  const isStale = trimmed !== debounced;
  const isSettled = isActive && !isStale;

  return {
    results: isSettled ? (data ?? []) : [],
    error:
      isSettled && error
        ? error instanceof ApiError
          ? error.message
          : "Search failed."
        : "",
    isLoading: isActive && (isStale || isLoading),
  };
}
