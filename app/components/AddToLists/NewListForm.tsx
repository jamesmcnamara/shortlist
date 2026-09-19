import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { api, ApiError, type RoomSummaryWithMovie } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import styles from "./AddToLists.module.css";

interface NewListFormProps {
  onCreated: (room: RoomSummaryWithMovie) => void;
}

/** Inline watch list creation, so a missing list never interrupts adding a movie. */
export function NewListForm({ onCreated }: NewListFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      const room = await api.rooms.create({
        name: trimmed,
        preset: "watchlist",
      });
      onCreated({ ...room, role: "admin", hasMovie: false });
      setName("");
      setIsOpen(false);
    } catch (error) {
      setError(
        error instanceof ApiError ? error.message : "Unable to create the list.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.newList}>
      <button
        className={styles.newListToggle}
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "Cancel" : "+ New list"}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            className={styles.newListFields}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className={styles.newListRow}>
              <input
                autoFocus
                className={styles.newListInput}
                type="text"
                aria-label="New list name"
                placeholder="Name this list"
                value={name}
                disabled={isSubmitting}
                onChange={withTargetValue(setName)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  create();
                }}
              />
              <button
                className={styles.newListCreate}
                type="button"
                disabled={!name.trim() || isSubmitting}
                onClick={create}
              >
                {isSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
            {error && (
              <p className={styles.rowError} role="alert">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
