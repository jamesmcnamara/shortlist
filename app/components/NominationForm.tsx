import { withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import { useId, useState } from "react";
import { Ratings } from "./Ratings";
import styles from "./NominationForm.module.css";

type NominationFormProps = {
  candidate: Movie;
  initialComment?: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (comment: string) => void;
};

export function NominationForm({
  candidate,
  initialComment = "",
  isSubmitting,
  onCancel,
  onSubmit,
}: NominationFormProps) {
  const [comment, setComment] = useState(initialComment);
  const commentId = useId();

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
          <Ratings
            movieTitle={candidate.details.title}
            services={candidate.ratings.services}
            wikipediaUrl={candidate.details.wikipediaUrl}
          />
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

      <label className={styles.label} htmlFor={commentId}>
        Why should we watch it?
      </label>
      <textarea
        id={commentId}
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
