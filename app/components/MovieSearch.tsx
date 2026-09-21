"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useDebouncedCallback } from "use-debounce";
import { api, ApiError } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import { AddToLists } from "@/app/components/AddToLists/AddToLists";
import { AppMenu } from "@/app/components/AppMenu";
import { MovieDetail } from "@/app/components/MovieDetail";
import { MovieSearchResults } from "@/app/components/MovieSearchResults";
import styles from "./MovieSearch.module.css";

/** Movie search with the add-to-lists sheet. */
export function MovieSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [addingMovie, setAddingMovie] = useState<Movie | null>(null);
  const [statusMessage, setStatusMessage] = useState("");

  const searcher = useDebouncedCallback(
    async (_query: string) => {
      try {
        const results = await api.tmdb.search(query);
        if (query.startsWith(_query)) setResults(results);
      } catch (error) {
        setError(error instanceof ApiError ? error.message : "Search failed.");
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    350,
    { trailing: true },
  );

  useEffect(() => {
    setError("");
    if (query.length < 2) {
      searcher.cancel();
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searcher(query);
  }, [query]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => setStatusMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  function onAdded(count: number) {
    setStatusMessage(`Added to ${count} list${count === 1 ? "" : "s"}.`);
  }

  return (
    <>
      {selected ? (
        <MovieDetail
          movie={selected}
          onBack={() => setSelected(null)}
          onAdd={setAddingMovie}
        />
      ) : (
        <main className={styles.shell}>
          <div className={styles.header}>
            <h3>Show Me The Money!</h3>
            <AppMenu />
          </div>
          <div className={styles.body}>
            <div className={styles.searchInput}>
              <span>⌕</span>
              <input
                autoFocus
                type="text"
                aria-label="Search for a movie"
                placeholder="Search movies..."
                value={query}
                onChange={withTargetValue(setQuery)}
              />
              {query && (
                <button
                  type="button"
                  className={styles.clearButton}
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              )}
            </div>

            {query.length < 2 && !isSearching && (
              <p className={styles.hint}>
                Start typing to find a movie by title.
              </p>
            )}

            {statusMessage && (
              <p className={styles.status} role="status">
                {statusMessage}
              </p>
            )}

            <MovieSearchResults
              results={results}
              isLoading={isSearching}
              error={error}
              onSelect={setSelected}
              onAdd={setAddingMovie}
            />
          </div>
        </main>
      )}

      <AnimatePresence>
        {addingMovie && (
          <AddToLists
            movie={addingMovie}
            onClose={() => setAddingMovie(null)}
            onAdded={onAdded}
          />
        )}
      </AnimatePresence>
    </>
  );
}
