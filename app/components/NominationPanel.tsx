import type { SubmitEventHandler } from "react";
import type { MovieSearchResultData } from "./MovieSearchResult";
import { MovieSearchResults } from "./MovieSearchResults";
import styles from "./NominationPanel.module.css";

type NominationPanelProps = {
  nominatedThisMonth: boolean;
  query: string;
  isSearching: boolean;
  searchError: string;
  searchResults: MovieSearchResultData[];
  selectedMovie: MovieSearchResultData | null;
  comment: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  onSelect: (movie: MovieSearchResultData) => void;
  onClearSelection: () => void;
  onQueryChange: (value: string) => void;
  onCommentChange: (value: string) => void;
};

export function NominationPanel({
  nominatedThisMonth,
  query,
  isSearching,
  searchError,
  searchResults,
  selectedMovie,
  comment,
  isSubmitting,
  onClose,
  onSubmit,
  onSelect,
  onClearSelection,
  onQueryChange,
  onCommentChange
}: NominationPanelProps) {
  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <div>
          <h2>Nominate a movie</h2>
          <p className={styles.intro}>Add a movie for the club to vote on.</p>
        </div>
        <button className={styles.close} type="button" onClick={onClose} aria-label="Close nomination panel">×</button>
      </div>
      {nominatedThisMonth ? (
        <div className={styles.limitMessage}>
          <span>✓</span>
          <div>
            <strong>Challenge accepted.</strong>
            <p>You can nominate again when next month rolls around.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          {selectedMovie ? (
            <>
              <div className={styles.selected}>
                {selectedMovie.posterUrl ? (
                  <img src={selectedMovie.posterUrl} alt={`Poster for ${selectedMovie.title}`} />
                ) : (
                  <div className={styles.selectedPlaceholder} aria-label="No poster available">No poster</div>
                )}
                <div className={styles.selectedCopy}>
                  <h3>{selectedMovie.title}</h3>
                  <p>
                    {selectedMovie.releaseDate ? selectedMovie.releaseDate.slice(0, 4) : "Year unknown"}
                    {selectedMovie.tmdbRating ? ` · ★ ${selectedMovie.tmdbRating.toFixed(1)}` : ""}
                  </p>
                  {selectedMovie.overview && <span>{selectedMovie.overview}</span>}
                </div>
                <button
                  className={styles.close}
                  type="button"
                  onClick={onClearSelection}
                  aria-label="Pick a different movie"
                >×</button>
              </div>

              <label className={styles.label} htmlFor="nomination-comment">Why should we watch it?</label>
              <textarea
                id="nomination-comment"
                className={styles.comment}
                autoFocus
                rows={4}
                placeholder="Make your case..."
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
              />
            </>
          ) : (
            <>
              <div className={styles.searchInput}>
                <span>⌕</span>
                <input
                  id="movie-title"
                  autoFocus
                  type="text"
                  aria-label="Search for a movie"
                  placeholder="Search movies..."
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  required
                />
              </div>
              <MovieSearchResults results={searchResults} isLoading={isSearching} error={searchError} onSelect={onSelect} />
            </>
          )}
          <div className={styles.footer}>
            <span>One nomination per person, per month.</span>
            <button type="submit" disabled={!selectedMovie || isSubmitting}>
              {isSubmitting ? "Nominating..." : "Nominate movie"} <span>→</span>
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
