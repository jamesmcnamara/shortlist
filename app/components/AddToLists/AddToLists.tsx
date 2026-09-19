"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { api, ApiError, type RoomSummaryWithMovie } from "@/app/lib/api";
import type { Movie } from "@/src/db/schema";
import { EmptyState } from "./EmptyState";
import { RoomRow } from "./RoomRow";
import { RoomSkeleton } from "./RoomSkeleton";
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
 * each with its own optional note. Movie club rooms use nominations instead,
 * so they never appear here.
 */
export function AddToLists({ movie, onClose, onAdded }: AddToListsProps) {
  const [allRooms, setAllRooms] = useState<RoomSummaryWithMovie[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.rooms
      .listForMovie(movie.id)
      .then((data) => {
        if (!cancelled) setAllRooms(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Unable to load your lists.");
      });
    return () => {
      cancelled = true;
    };
  }, [movie.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const watchlists = useMemo(
    () => (allRooms ?? []).filter((room) => room.type === "watchlist"),
    [allRooms],
  );

  const selectedSlugs = useMemo(
    () => Object.keys(selected).filter((slug) => selected[slug]),
    [selected],
  );

  function toggle(slug: string) {
    setSelected((prev) => ({ ...prev, [slug]: !prev[slug] }));
    setRowErrors((prev) => ({ ...prev, [slug]: "" }));
  }

  function addRoom(room: RoomSummaryWithMovie) {
    setAllRooms((prev) => [room, ...(prev ?? [])]);
    setSelected((prev) => ({ ...prev, [room.slug]: true }));
  }

  async function submit() {
    if (selectedSlugs.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setStatus((prev) => ({ ...prev, ...pending(selectedSlugs) }));

    const results = await Promise.allSettled(
      selectedSlugs.map((slug) =>
        api.room(slug).nominations.create({
          movieId: movie.id,
          comment: comments[slug] ?? "",
        }),
      ),
    );

    setStatus((prev) => ({ ...prev, ...statusesFor(selectedSlugs, results) }));
    setRowErrors((prev) => ({ ...prev, ...errorsFor(selectedSlugs, results) }));
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
          <div className={styles.rooms}>
            {allRooms === null && !loadError && <RoomSkeleton />}
            {loadError && (
              <p className={styles.status} role="alert">
                {loadError}
              </p>
            )}
            {allRooms !== null && watchlists.length === 0 && (
              <EmptyState hasOtherRooms={allRooms.length > 0} />
            )}
            {watchlists.map((room) => (
              <RoomRow
                key={room.slug}
                room={room}
                checked={Boolean(selected[room.slug])}
                comment={comments[room.slug] ?? ""}
                status={status[room.slug] ?? "idle"}
                error={rowErrors[room.slug] ?? ""}
                onToggle={() => toggle(room.slug)}
                onCommentChange={(value) =>
                  setComments((prev) => ({ ...prev, [room.slug]: value }))
                }
              />
            ))}
            {allRooms !== null && !loadError && (
              <NewListForm onCreated={addRoom} />
            )}
          </div>

          {watchlists.length > 0 && (
            <SheetFooter
              count={selectedSlugs.length}
              isSubmitting={isSubmitting}
            />
          )}
        </form>
      </motion.div>
    </div>
  );
}

type Results = PromiseSettledResult<unknown>[];

const pending = (slugs: string[]): Record<string, RowStatus> =>
  Object.fromEntries(slugs.map((slug) => [slug, "pending"]));

const statusesFor = (
  slugs: string[],
  results: Results,
): Record<string, RowStatus> =>
  Object.fromEntries(
    slugs.map((slug, index) => [
      slug,
      results[index].status === "fulfilled" ? "done" : "error",
    ]),
  );

const errorsFor = (slugs: string[], results: Results): Record<string, string> =>
  Object.fromEntries(
    slugs.flatMap((slug, index) => {
      const result = results[index];
      if (result.status === "fulfilled") return [];
      return [
        [
          slug,
          result.reason instanceof ApiError
            ? result.reason.message
            : "Something went wrong.",
        ],
      ];
    }),
  );
