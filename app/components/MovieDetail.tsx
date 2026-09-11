import type { Movie } from "@/src/db/schema";
import { tmdbImageUrl } from "@/app/lib/utils";
import { MovieRatings } from "./MovieRatings";
import styles from "./MovieDetail.module.css";

interface MovieDetailProps {
  movie: Movie;
  onBack: () => void;
}

/** Full-screen, richly rendered view of a single movie's details. */
export function MovieDetail({ movie, onBack }: MovieDetailProps) {
  const { details, ratings } = movie;
  console.log(movie);
  const backdropUrl = tmdbImageUrl(details.backdrop_path, "w1280");
  const year = details.release_date ? details.release_date.slice(0, 4) : null;

  return (
    <div className={styles.detail}>
      <div
        className={styles.backdrop}
        style={
          backdropUrl ? { backgroundImage: `url(${backdropUrl})` } : undefined
        }
      >
        <button
          className={styles.back}
          type="button"
          onClick={onBack}
          aria-label="Back to search"
        >
          ←
        </button>
        <div className={styles.heading}>
          <div className={styles.poster}>
            {details.posterUrl ? (
              <img
                src={details.posterUrl}
                alt={`Poster for ${details.title}`}
              />
            ) : (
              <div
                className={styles.posterPlaceholder}
                aria-label="No poster available"
              >
                No poster
              </div>
            )}
          </div>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>{details.title}</h1>
            {details.tagline && (
              <p className={styles.tagline}>{details.tagline}</p>
            )}
            <div className={styles.metaRow}>
              {year && <span>{year}</span>}
              {details.runtime ? (
                <span>{formatRuntime(details.runtime)}</span>
              ) : null}
              {details.vote_average ? (
                <span>★ {details.vote_average.toFixed(1)}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        {details.genres.length > 0 && (
          <div className={styles.genres}>
            {details.genres.map((genre) => (
              <span key={genre.id} className={styles.genre}>
                {genre.name}
              </span>
            ))}
          </div>
        )}

        {details.overview && (
          <p className={styles.overview}>{details.overview}</p>
        )}

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Ratings</h2>
          <MovieRatings services={ratings.services} />
        </div>
      </div>
    </div>
  );
}

const formatRuntime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
};
