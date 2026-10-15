"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { api, ApiError, type TheatreSummaryWithMovie } from "@/app/lib/api";
import { useTheatresForMovie } from "@/app/lib/data/queries";
import type { Movie } from "@/src/db/schema";
import { EmptyState } from "./EmptyState";
import { TheatreRow } from "./TheatreRow";
import { TheatreSkeleton } from "./TheatreSkeleton";
import { NewListForm } from "./NewListForm";
import { SheetFooter } from "./SheetFooter";
import { SheetHeader } from "./SheetHeader";
import type { RowStatus } from "./types";
import styles from "./AddToLists.module.css";

interface AddToListsProps {
  movie: Movie;
  onClose: () => void;
  onAdded?: (count: number) => void;
}

/**
 * Bottom sheet for adding a movie to one or more shared watch lists at once,
 * each with its own optional note.
 */
export function AddToLists({ movie, onClose, onAdded }: AddToListsProps) {
  const { data: allTheatres, error, retry } = useTheatresForMovie(movie.id);
  const loadError = error?.message;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const selectedTheatreIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    setRowErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function addTheatre(theatre: TheatreSummaryWithMovie) {
    setSelected((prev) => ({ ...prev, [theatre.id]: true }));
  }

  async function submit() {
    if (selectedTheatreIds.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setStatus((prev) => ({ ...prev, ...pending(selectedTheatreIds) }));

    const results = await Promise.allSettled(
      selectedTheatreIds.map((id) => {
        const theatre = allTheatres?.find((candidate) => candidate.id === id);
        if (!theatre) {
          throw new Error("The selected theatre is no longer available.");
        }
        return api.theatre(theatre.id).nominations.create({
          movieId: movie.id,
          comment: comments[id] ?? "",
        });
      }),
    );

    setStatus((prev) => ({
      ...prev,
      ...statusesFor(selectedTheatreIds, results),
    }));
    setRowErrors((prev) => ({
      ...prev,
      ...errorsFor(selectedTheatreIds, results),
    }));
    setIsSubmitting(false);

    const succeeded = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    if (succeeded === results.length) {
      onAdded?.(succeeded);
      onClose();
    }
  }

  return (
    <div className={styles.scrim} onClick={onClose}>
      <motion.div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${movie.details.title} to a list`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onClick={(event) => event.stopPropagation()}
      >
        <SheetHeader movie={movie} onClose={onClose} />

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className={styles.theatres}>
            {!allTheatres && !loadError && <TheatreSkeleton />}
            {loadError && (
              <p className={styles.status} role="alert">
                {loadError}
                {" "}
                <button type="button" onClick={() => retry()}>
                  Try again
                </button>
              </p>
            )}
            {allTheatres?.length === 0 && <EmptyState />}
            {(allTheatres ?? []).map((theatre) => (
              <TheatreRow
                key={theatre.id}
                theatre={theatre}
                checked={Boolean(selected[theatre.id])}
                comment={comments[theatre.id] ?? ""}
                status={status[theatre.id] ?? "idle"}
                error={rowErrors[theatre.id] ?? ""}
                onToggle={() => toggle(theatre.id)}
                onCommentChange={(value) =>
                  setComments((prev) => ({ ...prev, [theatre.id]: value }))
                }
              />
            ))}
            {allTheatres && !loadError && (
              <NewListForm onCreated={addTheatre} />
            )}
          </div>

          {(allTheatres ?? []).length > 0 && (
            <SheetFooter
              count={selectedTheatreIds.length}
              isSubmitting={isSubmitting}
            />
          )}
        </form>
      </motion.div>
    </div>
  );
}

type Results = PromiseSettledResult<unknown>[];

const pending = (theatreIds: string[]): Record<string, RowStatus> =>
  Object.fromEntries(theatreIds.map((theatreId) => [theatreId, "pending"]));

const statusesFor = (
  theatreIds: string[],
  results: Results,
): Record<string, RowStatus> =>
  Object.fromEntries(
    theatreIds.map((theatreId, index) => [
      theatreId,
      results[index].status === "fulfilled" ? "done" : "error",
    ]),
  );

const errorsFor = (
  theatreIds: string[],
  results: Results,
): Record<string, string> =>
  Object.fromEntries(
    theatreIds.flatMap((theatreId, index) => {
      const result = results[index];
      if (result.status === "fulfilled") return [];
      return [
        [
          theatreId,
          result.reason instanceof ApiError
            ? result.reason.message
            : "Something went wrong.",
        ],
      ];
    }),
  );
