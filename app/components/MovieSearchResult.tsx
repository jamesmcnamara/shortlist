import type { Movie } from "@/src/db/schema";
import styles from "./MovieSearchResult.module.css";

interface MovieSearchResultProps {
  movie: Movie;
  onSelect?: (movie: Movie) => void;
}

export function MovieSearchResult({ movie, onSelect }: MovieSearchResultProps) {
  const year = movie.details.release_date
    ? movie.details.release_date.slice(0, 4)
    : "Year unknown";

  return (
    <li
      className={styles.result}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={() => onSelect?.(movie)}
      onKeyDown={(event) => {
        if (onSelect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect(movie);
        }
      }}
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
        <h3>{movie.details.title}</h3>
        <p>{year}</p>
        {movie.details.overview && <span>{movie.details.overview}</span>}
      </div>
    </li>
  );
}
