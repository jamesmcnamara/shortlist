import { api, ApiError } from "@/app/lib/api";
import type { Movie } from "@/src/db/schema";
import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";

const MIN_QUERY_LENGTH = 2;

export interface MovieSearchResult {
  results: Movie[];
  error: string;
  isLoading: boolean;
}

/** Debounced TMDB search that drops responses for stale queries. */
export function useMovieSearch(query: string): MovieSearchResult {
  const trimmed = query.trim();
  const [debounced] = useDebounce(trimmed, 350);
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setError("");
    setResults([]);
    if (debounced.length < MIN_QUERY_LENGTH) {
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    api.tmdb
      .search(debounced, controller.signal)
      .then((movies) => {
        if (!controller.signal.aborted) setResults(movies);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setError(error instanceof ApiError ? error.message : "Search failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [debounced]);

  const isActive = trimmed.length >= MIN_QUERY_LENGTH;
  const isStale = trimmed !== debounced;

  return {
    results: isActive && !isStale ? results : [],
    error: isActive && !isStale ? error : "",
    isLoading: isActive && (isStale || isLoading),
  };
}
