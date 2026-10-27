import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { TheatreSummary } from "@/app/lib/api";
import { ListOption } from "../ListPicker/ListOption";
import { NoteField } from "../ListPicker/NoteField";
import { RowError } from "../ListPicker/RowError";
import type { RowStatus } from "../ListPicker/types";
import styles from "./AddToLists.module.css";

interface TheatreRowProps {
  theatre: TheatreSummary;
  hasMovie: boolean;
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
  hasMovie,
  checked,
  comment,
  status,
  error,
  onToggle,
  onCommentChange,
}: TheatreRowProps) {
  const justAdded = status === "done";
  const isPending = status === "pending";
  const locked = hasMovie || justAdded;
  const reducedMotion = useReducedMotion();

  return (
    <div className={styles.row}>
      <ListOption
        name={theatre.name}
        checked={checked}
        locked={locked}
        disabled={isPending}
        isPending={isPending}
        hint={hasMovie ? "Already on this list" : justAdded ? "Added ✓" : ""}
        onToggle={onToggle}
      />
      <AnimatePresence initial={false}>
        {checked && !locked && (
          <motion.div
            className={styles.commentWrap}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
          >
            <NoteField
              value={comment}
              disabled={isPending}
              onChange={onCommentChange}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {status === "error" && error && <RowError message={error} />}
    </div>
  );
}
