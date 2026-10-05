import { withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import { useState } from "react";
import { MovieRatings } from "./MovieRatings";
import styles from "./NominationForm.module.css";

type NominationFormProps = {
  candidate: Movie;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (comment: string) => void;
};

export function NominationForm({
  candidate,
  isSubmitting,
  onCancel,
  onSubmit,
}: NominationFormProps) {
  const [comment, setComment] = useState("");

  return (
    <form
      className={styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(comment);
      }}
    >
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
          onClick={onCancel}
          aria-label="Cancel nomination"
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
        onChange={withTargetValue(setComment)}
      />

      <div className={styles.footer}>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Adding..." : "Add movie"} <span>→</span>
        </button>
      </div>
    </form>
  );
}
