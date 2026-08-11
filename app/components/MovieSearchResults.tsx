import { MovieSearchResult } from "./MovieSearchResult";
import type { MovieSearchResultData } from "./MovieSearchResult";
import styles from "./MovieSearchResults.module.css";

type MovieSearchResultsProps = {
  results: MovieSearchResultData[];
  isLoading: boolean;
  error: string;
  onSelect?: (movie: MovieSearchResultData) => void;
};

export function MovieSearchResults({
  results,
  isLoading,
  error,
  onSelect,
}: MovieSearchResultsProps) {
  if (isLoading) {
    return (
      <p className={styles.status} role="status">
        Searching TMDB...
      </p>
    );
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
          <MovieSearchResult key={movie.id} movie={movie} onSelect={onSelect} />
        ))}
      </ul>
    </section>
  );
}
