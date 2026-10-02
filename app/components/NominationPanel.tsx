import { api, ApiError } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { MovieRatings } from "./MovieRatings";
import { MovieSearchResults } from "./MovieSearchResults";
import styles from "./NominationPanel.module.css";

type NominationPanelProps = {
  isSubmitting: boolean;
  existing: Set<number>;
  onClose: () => void;
  onSubmit: (movie: Movie, comment: string) => void;
};

export function NominationPanel({
  isSubmitting,
  existing,
  onClose,
  onSubmit,
}: NominationPanelProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [error, setError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [candidate, setCandidate] = useState<Movie | null>(null);
  const [comment, setComment] = useState("");

  const searcher = useDebouncedCallback(
    (query: string) => {
      api.tmdb
        .search(query)
        .then(setSearchResults)
        .catch((error) => {
          if (error instanceof ApiError) {
            setError(error.message);
          } else {
            setError("Search failed.");
          }
          setSearchResults([]);
        })
        .finally(() => {
          setIsSearching(false);
        });
    },
    350,
    { trailing: true },
  );

  function onSelect(movie: Movie) {
    if (movie.tmdbId !== null && existing.has(movie.tmdbId)) {
      setError("This movie is already on the list.");
      return;
    }
    setCandidate(movie);
    setQuery("");
    setSearchResults([]);
  }

  function reset() {
    setCandidate(null);
    setQuery("");
    setSearchResults([]);
    setComment("");
  }

  useEffect(() => {
    setError("");
    if (candidate || query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searcher(query);
  }, [query, candidate]);

  return (
    <motion.section
      className={styles.panel}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Header onClose={onClose} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (candidate) {
            onSubmit(candidate, comment);
          }
          reset();
        }}
      >
        {candidate ? (
          <CandidateForm
            candidate={candidate}
            comment={comment}
            reset={reset}
            onCommentChange={setComment}
          />
        ) : (
          <Search
            query={query}
            searchResults={searchResults}
            error={error}
            isSearching={isSearching}
            onSelect={onSelect}
            onQueryChange={setQuery}
          />
        )}
        <div className={styles.footer}>
          <button type="submit" disabled={!candidate || isSubmitting}>
            {isSubmitting ? "Adding..." : "Add movie"} <span>→</span>
          </button>
        </div>
      </form>
    </motion.section>
  );
}

interface HeaderProps {
  onClose: () => void;
}

const Header = ({ onClose }: HeaderProps) => (
  <div className={styles.heading}>
    <div>
      <h2>Add a movie</h2>
      <p className={styles.intro}>
        You can add as many movies as you like, so go nuts.
      </p>
    </div>
    <button
      className={styles.close}
      type="button"
      onClick={onClose}
      aria-label="Close nomination panel"
    >
      ×
    </button>
  </div>
);

interface CandidateFormProps {
  candidate: Movie;
  comment: string;
  reset(): void;
  onCommentChange(comment: string): void;
}

const CandidateForm = ({
  candidate,
  comment,
  reset,
  onCommentChange,
}: CandidateFormProps) => (
  <>
    <div className={styles.selected}>
      {candidate.details.posterUrl ? (
        <img
          src={candidate.details.posterUrl}
          alt={`Poster for ${candidate.details.title}`}
        />
      ) : (
        <div
          className={styles.selectedPlaceholder}
          aria-label="No poster available"
        >
          No poster
        </div>
      )}
      <div className={styles.selectedCopy}>
        <h3>{candidate.details.title}</h3>
        <p>
          {candidate.details.release_date
            ? candidate.details.release_date.slice(0, 4)
            : "Year unknown"}
          {candidate.details.vote_average
            ? ` · ★ ${candidate.details.vote_average.toFixed(1)}`
            : ""}
        </p>
        {candidate.details.overview && (
          <span>{candidate.details.overview}</span>
        )}
        <MovieRatings services={candidate.ratings.services} />
      </div>
      <button
        className={styles.close}
        type="button"
        onClick={reset}
        aria-label="Pick a different movie"
      >
        ×
      </button>
    </div>

    <label className={styles.label} htmlFor="nomination-comment">
      Why should we watch it?
    </label>
    <textarea
      id="nomination-comment"
      className={styles.comment}
      autoFocus
      rows={4}
      placeholder="Make your case..."
      value={comment}
      onChange={withTargetValue(onCommentChange)}
    />
  </>
);

interface SearchProps {
  query: string;
  searchResults: Movie[];
  error: string;
  isSearching: boolean;
  onQueryChange(query: string): void;
  onSelect(movie: Movie): void;
}

const Search = ({
  query,
  searchResults,
  error,
  isSearching,
  onSelect,
  onQueryChange,
}: SearchProps) => (
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
        onChange={withTargetValue(onQueryChange)}
        required
      />
    </div>
    <MovieSearchResults
      results={searchResults}
      isLoading={isSearching}
      error={error}
      onSelect={onSelect}
    />
  </>
);
