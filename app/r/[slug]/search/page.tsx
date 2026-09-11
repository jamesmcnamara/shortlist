"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useDebouncedCallback } from "use-debounce";
import { api, ApiError } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import { MovieDetail } from "@/app/components/MovieDetail";
import { MovieSearchResults } from "@/app/components/MovieSearchResults";
import { useRoom } from "../RoomContext";
import styles from "./page.module.css";

export default function SearchPage() {
  const { room } = useRoom();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Movie | null>(null);

  const searcher = useDebouncedCallback(
    (query: string) => {
      api.tmdb
        .search(query)
        .then(setResults)
        .catch((error) => {
          setError(error instanceof ApiError ? error.message : "Search failed.");
          setResults([]);
        })
        .finally(() => setIsSearching(false));
    },
    350,
    { trailing: true },
  );

  useEffect(() => {
    setError("");
    if (query.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searcher(query);
  }, [query]);

  if (selected) {
    return <MovieDetail movie={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <main className={styles.shell}>
      <div className={styles.header}>
        <Link
          className={styles.back}
          href={`/r/${room.slug}`}
          aria-label="Back to the list"
        >
          ←
        </Link>
        <h1 className={styles.title}>Search movies</h1>
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
        </div>

        {query.length < 2 && !isSearching && (
          <p className={styles.hint}>
            Start typing to find a movie by title.
          </p>
        )}

        <MovieSearchResults
          results={results}
          isLoading={isSearching}
          error={error}
          onSelect={setSelected}
        />
      </div>
    </main>
  );
}
