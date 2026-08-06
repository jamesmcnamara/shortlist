import type { Movie } from "./shortlist-types";
import styles from "./WatchedArchive.module.css";

export function WatchedArchive({ movies }: { movies: Movie[] }) {
  if (movies.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <div>
          <span>Archive</span>
          <h2>Watched together</h2>
        </div>
        <small>{movies.length} movie{movies.length === 1 ? "" : "s"}</small>
      </div>
      <div className={styles.row}>
        {movies.map((movie) => <span className={styles.pill} key={movie.id}>✓ {movie.title}</span>)}
      </div>
    </section>
  );
}
