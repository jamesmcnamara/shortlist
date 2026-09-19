import { AnimatePresence, motion } from "motion/react";
import { withTargetValue } from "@/app/lib/utils";
import type { RoomSummaryWithMovie } from "@/app/lib/api";
import type { RowStatus } from "./types";
import styles from "./AddToLists.module.css";

interface RoomRowProps {
  room: RoomSummaryWithMovie;
  checked: boolean;
  comment: string;
  status: RowStatus;
  error: string;
  onToggle: () => void;
  onCommentChange: (value: string) => void;
}

/** One watch list, with the note that will be posted alongside the movie. */
export function RoomRow({
  room,
  checked,
  comment,
  status,
  error,
  onToggle,
  onCommentChange,
}: RoomRowProps) {
  const justAdded = status === "done";
  const isPending = status === "pending";
  const locked = room.hasMovie || justAdded;

  return (
    <div className={styles.row}>
      <label
        className={`${styles.roomLabel} ${locked ? styles.roomLabelLocked : ""}`}
      >
        <input
          type="checkbox"
          checked={locked || checked}
          disabled={locked || isPending}
          onChange={onToggle}
        />
        <span className={styles.roomName}>{room.name}</span>
        {room.hasMovie && (
          <span className={styles.roomHint}>Already on this list</span>
        )}
        {justAdded && <span className={styles.roomHint}>Added ✓</span>}
        {isPending && <span className={styles.spinner} aria-hidden="true" />}
      </label>
      <AnimatePresence initial={false}>
        {checked && !locked && (
          <motion.div
            className={styles.commentWrap}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
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
