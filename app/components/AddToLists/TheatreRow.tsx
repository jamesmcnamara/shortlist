import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { withTargetValue } from "@/app/lib/utils";
import type { TheatreSummaryWithMovie } from "@/app/lib/api";
import type { RowStatus } from "./types";
import styles from "./AddToLists.module.css";

interface TheatreRowProps {
  theatre: TheatreSummaryWithMovie;
  checked: boolean;
  comment: string;
  status: RowStatus;
  error: string;
  onToggle: () => void;
  onCommentChange: (value: string) => void;
}

/** One watch list, with the note that will be posted alongside the movie. */
export function TheatreRow({
  theatre,
  checked,
  comment,
  status,
  error,
  onToggle,
  onCommentChange,
}: TheatreRowProps) {
  const justAdded = status === "done";
  const isPending = status === "pending";
  const locked = theatre.hasMovie || justAdded;
  const reducedMotion = useReducedMotion();

  return (
    <div className={styles.row}>
      <label
        className={`${styles.theatreLabel} ${locked ? styles.theatreLabelLocked : ""}`}
      >
        <input
          type="checkbox"
          checked={locked || checked}
          disabled={locked || isPending}
          onChange={onToggle}
        />
        <span className={styles.theatreName}>{theatre.name}</span>
        {theatre.hasMovie && (
          <span className={styles.theatreHint}>Already on this list</span>
        )}
        {justAdded && <span className={styles.theatreHint}>Added ✓</span>}
        {isPending && <span className={styles.spinner} aria-hidden="true" />}
      </label>
      <AnimatePresence initial={false}>
        {checked && !locked && (
          <motion.div
            className={styles.commentWrap}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <textarea
              className={styles.comment}
              rows={3}
              placeholder="Why should they watch it?"
              value={comment}
              disabled={isPending}
              onChange={withTargetValue(onCommentChange)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {status === "error" && error && (
        <p className={styles.rowError} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
