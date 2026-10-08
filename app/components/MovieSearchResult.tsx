import type { Movie } from "@/src/db/schema";
import { useState } from "react";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import styles from "./MovieSearchResult.module.css";
import { MovieStreaming } from "./MovieStreaming";

interface MovieSearchResultProps {
  movie: Movie;
  onSelect?: (movie: Movie) => void;
  onAdd?: (movie: Movie) => void;
  onQuickAdd?: (movie: Movie) => Promise<void>;
}

export function MovieSearchResult({
  movie,
  onSelect,
  onAdd,
  onQuickAdd,
}: MovieSearchResultProps) {
  const [isAdding, setIsAdding] = useState(false);
  const year = movie.details.release_date
    ? movie.details.release_date.slice(0, 4)
    : "Year unknown";

  return (
    <li
      className={styles.result}
      onClick={() => onSelect?.(movie)}
    >
      {movie.details.posterUrl ? (
        <img
          src={movie.details.posterUrl}
          alt={`Poster for ${movie.details.title}`}
        />
      ) : (
        <div className={styles.placeholder} aria-label="No poster available">
          No poster
        </div>
      )}
      <div className={styles.copy}>
        <h3>
          {onSelect ? (
            <button
              className={styles.select}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(movie);
              }}
            >
              {movie.details.title}
            </button>
          ) : (
            movie.details.title
          )}
        </h3>
        <p>{year}</p>
        {movie.details.overview && (
          <span className={styles.overview}>{movie.details.overview}</span>
        )}
        <MovieStreaming availability={movie.details.justWatch} />
      </div>
      {(() => {
        switch (true) {
          case isAdding:
            return <LoadingOverlay inline label="Adding movie..." />;
          case !!onAdd:
            return (
              <button
                className={styles.add}
                type="button"
                aria-label={`Add ${movie.details.title} to a list`}
                onClick={(event) => {
                  event.stopPropagation();
                  onAdd(movie);
                }}
              >
                {plusIcon}
              </button>
            );
          case !!onQuickAdd:
            return (
              <button
                className={styles.addIcon}
                type="button"
                aria-label={`Add ${movie.details.title} to this list`}
                onClick={async (event) => {
                  event.stopPropagation();
                  setIsAdding(true);
                  try {
                    await onQuickAdd(movie);
                  } finally {
                    setIsAdding(false);
                  }
                }}
              >
                {plusIcon}
              </button>
            );
        }
      })()}
    </li>
  );
}

const plusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8 3v10M3 8h10" />
  </svg>
);
