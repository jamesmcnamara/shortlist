import type { SubmitEventHandler } from "react";
import type { MovieSearchResultData } from "./MovieSearchResult";
import { MovieSearchResults } from "./MovieSearchResults";
import styles from "./NominationPanel.module.css";

type NominationPanelProps = {
  nominatedThisMonth: boolean;
  title: string;
  isSearching: boolean;
  searchError: string;
  searchResults: MovieSearchResultData[];
  onClose: () => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  onSelect: (movie: MovieSearchResultData) => void;
  onTitleChange: (value: string) => void;
};

export function NominationPanel({
  nominatedThisMonth,
  title,
  isSearching,
  searchError,
  searchResults,
  onClose,
  onSubmit,
  onSelect,
  onTitleChange
}: NominationPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>Your monthly move</span>
          <h2>Volunteer as Tribute</h2>
        </div>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close nomination panel">×</button>
      </div>
      {nominatedThisMonth ? (
        <div className={styles.limitMessage}>
          <span>✓</span>
          <div>
            <strong>Tribute delivered.</strong>
            <p>You can nominate again when next month rolls around.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <label className={styles.label} htmlFor="movie-title">Name the movie</label>
          <div className={styles.searchInput}>
            <span>⌕</span>
            <input
              id="movie-title"
              autoFocus
              type="text"
              placeholder="Search the movie universe..."
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              required
            />
          </div>
          <MovieSearchResults results={searchResults} isLoading={isSearching} error={searchError} onSelect={onSelect} />
          <div className={styles.footer}>
            <span>One nomination per person, per month.</span>
            <button type="submit">Nominate movie <span>→</span></button>
          </div>
        </form>
      )}
    </section>
  );
}
