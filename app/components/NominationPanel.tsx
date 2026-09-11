import { api, ApiError } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import type { Movie, Nomination } from "@/src/db/schema";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { MovieSearchResults } from "./MovieSearchResults";
import styles from "./NominationPanel.module.css";
import { PresetName } from "../lib/rooms";

type NominationPanelProps = {
  currentNomination: Nomination | null;
  isSubmitting: boolean;
  roomType: PresetName;
  existing: Set<number>;
  onClose: () => void;
  onSubmit: (movie: Movie, comment: string) => void;
  onRescind: () => void;
};

export function NominationPanel({
  currentNomination,
  isSubmitting,
  roomType,
  existing,
  onClose,
  onSubmit,
  onRescind,
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
      setError("This movie has already been nominated.");
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
      <Header
        roomType={roomType}
        onClose={onClose}
        isDropping={!!currentNomination}
      />

      {currentNomination ? (
        <DropNomination
          currentNomination={currentNomination}
          isSubmitting={isSubmitting}
          onRescind={onRescind}
        />
      ) : (
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
            <span>One nomination per person, per month.</span>
            <button type="submit" disabled={!candidate || isSubmitting}>
              {getSubmitButtonText(isSubmitting, roomType)} <span>→</span>
            </button>
          </div>
        </form>
      )}
    </motion.section>
  );
}

function getSubmitButtonText(isSubmitting: boolean, roomType: PresetName) {
  if (isSubmitting) {
    if (roomType === "watchlist") {
      return "Adding...";
    }
    return "Nominating...";
  } else {
    if (roomType === "watchlist") {
      return "Add movie";
    }
    return "Nominate movie";
  }
}

interface HeaderProps {
  roomType: PresetName;
  isDropping?: boolean;
  onClose: () => void;
}

const Header = ({ roomType, isDropping = false, onClose }: HeaderProps) => (
  <div className={styles.heading}>
    <div>
      <h2>
        {isDropping
          ? HEADER_TEXT[roomType].drop.header
          : HEADER_TEXT[roomType].default.header}
      </h2>
      <p className={styles.intro}>
        {isDropping
          ? HEADER_TEXT[roomType].drop.body
          : HEADER_TEXT[roomType].default.body}
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

const HEADER_TEXT = {
  club: {
    default: {
      header: "Nominate a movie",
      body: "Add a movie for the club to vote on. You get one nomination a month, so spend it wisely.",
    },
    drop: {
      header: "Replace your nomination?",
      body: "Oh geez. People really aren't vibing with your pick, huh? Girl, I've been there. I once pitched Dogma at a Christian sleep away camp. But guess what? Unlike life, this app has do-overs. You can drop your nomination and pick a shiny new one. Just try not to shit the bed this time.",
    },
  },
  watchlist: {
    default: {
      header: "Add a movie",
      body: "You can add as many movies as you like, so go nuts.",
    },
    drop: {
      header: "How did you get here?",
      body: "This should never have been displayed. Fuck I'm a bad programmer. Please tell James to fix this.",
    },
  },
};

interface DropNominationProps {
  currentNomination: Nomination;
  isSubmitting: boolean;
  onRescind: () => void;
}

const DropNomination = ({
  currentNomination,
  isSubmitting,
  onRescind,
}: DropNominationProps) => (
  <div className={styles.currentNomination}>
    <div className={styles.selected}>
      {currentNomination.movie.details.posterUrl ? (
        <img
          src={currentNomination.movie.details.posterUrl}
          alt={`Poster for ${currentNomination.movie.details.title}`}
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
        <h3>{currentNomination.movie.details.title}</h3>
        {currentNomination.comment && <span>{currentNomination.comment}</span>}
      </div>
    </div>
    <button
      className={styles.rescind}
      type="button"
      onClick={onRescind}
      disabled={isSubmitting}
    >
      {isSubmitting ? "Dropping..." : "Drop nomination"}
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
