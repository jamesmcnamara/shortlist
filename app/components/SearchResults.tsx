import { SearchResult } from "./SearchResult";
import { LoadingOverlay } from "./LoadingOverlay";
import type { Movie } from "@/src/db/schema";
import styles from "./SearchResults.module.css";

type SearchResultsProps = {
  results: Movie[];
  isLoading: boolean;
  error: string;
  onSelect?: (movie: Movie) => void;
  onAdd?: (movie: Movie) => void;
  onQuickAdd?: (movie: Movie) => Promise<void>;
};

export function SearchResults({
  results,
  isLoading,
  error,
  onSelect,
  onAdd,
  onQuickAdd,
}: SearchResultsProps) {
  if (isLoading) {
    return <LoadingOverlay fullscreen={false} label="Searching TMDB..." />;
  }

  if (error) {
    return (
      <p className={`${styles.status} ${styles.error}`} role="alert">
        {error}
      </p>
    );
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <section className={styles.results} aria-label="TMDB movie search results">
      <div className={styles.heading}>
        <h2>Matching movies</h2>
        <span>
          {results.length} result{results.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className={styles.list}>
        {results.map((movie) => (
          <SearchResult
            key={movie.id}
            movie={movie}
            onSelect={onSelect}
            onAdd={onAdd}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </ul>
    </section>
  );
}
