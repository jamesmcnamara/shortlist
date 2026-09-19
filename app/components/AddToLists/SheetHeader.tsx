import type { Movie } from "@/src/db/schema";
import styles from "./AddToLists.module.css";

interface SheetHeaderProps {
  movie: Movie;
  onClose: () => void;
}

export function SheetHeader({ movie, onClose }: SheetHeaderProps) {
  return (
    <div className={styles.header}>
      {movie.details.posterUrl ? (
        <img src={movie.details.posterUrl} alt="" className={styles.poster} />
      ) : (
        <div className={styles.posterPlaceholder} aria-hidden="true" />
      )}
      <div className={styles.headerCopy}>
        <h2>{movie.details.title}</h2>
        <p>Pick the lists this belongs on.</p>
      </div>
      <button
        className={styles.close}
        type="button"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
