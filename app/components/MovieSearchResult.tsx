import styles from "./MovieSearchResult.module.css";

export interface MovieSearchResultData {
  id: number;
  title: string;
  releaseDate: string;
  overview: string;
  posterUrl: string | null;
  tmdbRating: number | null;
};

interface MovieSearchResultProps {
  movie: MovieSearchResultData;
  onSelect?: (movie: MovieSearchResultData) => void;
};

export function MovieSearchResult({ movie, onSelect }: MovieSearchResultProps) {
  const year = movie.releaseDate ? movie.releaseDate.slice(0, 4) : "Year unknown";

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
      {movie.posterUrl ? (
        <img src={movie.posterUrl} alt={`Poster for ${movie.title}`} />
      ) : (
        <div className={styles.placeholder} aria-label="No poster available">
          No poster
        </div>
      )}
      <div className={styles.copy}>
        <h3>{movie.title}</h3>
        <p>{year}</p>
        {movie.overview && <span>{movie.overview}</span>}
      </div>
    </li>
  );
}
