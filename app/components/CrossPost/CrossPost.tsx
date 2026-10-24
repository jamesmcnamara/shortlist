"use client";

import { useState } from "react";
import { api, ApiError, type TheatreSummaryWithMovies } from "@/app/lib/api";
import { useTheatresForMovies } from "@/app/lib/data/queries";
import type { Nomination } from "@/src/db/schema";
import { ListOption } from "../ListPicker/ListOption";
import { ListPickerSheet } from "../ListPicker/ListPickerSheet";
import { NoteField } from "../ListPicker/NoteField";
import { RowError } from "../ListPicker/RowError";
import type { RowStatus } from "../ListPicker/types";
import styles from "./CrossPost.module.css";
import { mod, cons, filter, not, map } from "shades";

interface CrossPostProps {
  films: Nomination[];
  /** The theatre being posted from, which is left out of the choices. */
  theatreId: string;
  onClose: () => void;
  onPosted: (summary: { films: number; lists: number }) => void;
}

interface Pair {
  theatre: TheatreSummaryWithMovies;
  film: Nomination;
}

const pairKey = (theatreId: string, movieId: number) =>
  `${theatreId}:${movieId}`;

/**
 * Bottom sheet for posting films from one theatre to the user's other lists.
 * Each film carries one note, pre-filled with its recommendation here.
 */
export function CrossPost({
  films,
  theatreId,
  onClose,
  onPosted,
}: CrossPostProps) {
  const { data, error, retry } = useTheatresForMovies(map("movieId")(films));
  const theatres = filter(not({ id: theatreId }))(data ?? []);
  const loadError = error?.message;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<number, string>>(() =>
    Object.fromEntries(films.map((film) => [film.movieId, film.comment ?? ""])),
  );
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [filmErrors, setFilmErrors] = useState<Record<number, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pairs: Pair[] = (theatres ?? [])
    .filter((theatre) => selected[theatre.id])
    .flatMap((theatre) =>
      films
        .filter(
          (film) =>
            !theatre.movieIds.includes(film.movieId) &&
            status[pairKey(theatre.id, film.movieId)] !== "done",
        )
        .map((film) => ({ theatre, film })),
    );

  const listCount = new Set(pairs.map(({ theatre }) => theatre.id)).size;

  async function submit() {
    if (pairs.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setFilmErrors({});
    const keys = pairs.map(({ theatre, film }) =>
      pairKey(theatre.id, film.movieId),
    );
    setStatus((prev) => ({
      ...prev,
      ...Object.fromEntries(keys.map((key) => [key, "pending"])),
    }));

    const results = await Promise.allSettled(
      pairs.map(({ theatre, film }) =>
        api.theatre(theatre.id).nominations.create({
          movieId: film.movieId,
          comment: notes[film.movieId] ?? "",
        }),
      ),
    );

    setStatus((prev) => ({
      ...prev,
      ...Object.fromEntries(
        keys.map((key, index) => [
          key,
          results[index].status === "fulfilled" ? "done" : "error",
        ]),
      ),
    }));
    setFilmErrors(
      pairs.reduce<Record<number, string[]>>(
        (errors, { theatre, film }, index) => {
          const result = results[index];
          if (result.status === "fulfilled") return errors;
          const message =
            result.reason instanceof ApiError
              ? result.reason.message
              : "Something went wrong.";
          return mod(film.movieId)(consOrNew(`${theatre.name}: ${message}`))(
            errors,
          );
        },
        {},
      ),
    );
    setIsSubmitting(false);

    if (results.every((result) => result.status === "fulfilled")) {
      onPosted({
        films: new Set(pairs.map(({ film }) => film.movieId)).size,
        lists: listCount,
      });
      onClose();
    }
  }

  return (
    <ListPickerSheet
      label="Post to other lists"
      title="Post to other lists"
      subtitle={
        films.length === 1
          ? films[0].movie.details.title
          : `${films.length} films`
      }
      theatres={theatres}
      loadError={loadError}
      onRetry={retry}
      renderTheatre={(theatre) => (
        <ListRow
          key={theatre.id}
          theatre={theatre}
          films={films}
          statuses={films.map(
            (film) => status[pairKey(theatre.id, film.movieId)] ?? "idle",
          )}
          checked={Boolean(selected[theatre.id])}
          isSubmitting={isSubmitting}
          onToggle={() =>
            setSelected((prev) => ({
              ...prev,
              [theatre.id]: !prev[theatre.id],
            }))
          }
        />
      )}
      onCreated={(id) => setSelected((prev) => ({ ...prev, [id]: true }))}
      selectedCount={listCount}
      isSubmitting={isSubmitting}
      onSubmit={submit}
      onClose={onClose}
    >
      <h3 className={styles.sectionTitle}>
        {films.length === 1 ? "Note" : "Notes"}
      </h3>
      {films.map((film) => (
        <div key={film.movieId} className={styles.film}>
          <div className={styles.filmHeader}>
            {film.movie.details.posterUrl ? (
              <img
                src={film.movie.details.posterUrl}
                alt=""
                className={styles.filmPoster}
              />
            ) : (
              <div className={styles.filmPoster} aria-hidden="true" />
            )}
            <span className={styles.filmTitle}>{film.movie.details.title}</span>
          </div>
          <NoteField
            label={`Note for ${film.movie.details.title}`}
            value={notes[film.movieId] ?? ""}
            disabled={isSubmitting}
            onChange={(value) =>
              setNotes((prev) => ({ ...prev, [film.movieId]: value }))
            }
          />
          {(filmErrors[film.movieId] ?? []).map((message) => (
            <RowError key={message} message={message} />
          ))}
        </div>
      ))}
      <h3 className={styles.sectionTitle}>Lists</h3>
    </ListPickerSheet>
  );
}

interface ListRowProps {
  theatre: TheatreSummaryWithMovies;
  films: Nomination[];
  statuses: RowStatus[];
  checked: boolean;
  isSubmitting: boolean;
  onToggle: () => void;
}

function ListRow({
  theatre,
  films,
  statuses,
  checked,
  isSubmitting,
  onToggle,
}: ListRowProps) {
  const has = films.filter(
    (film, index) =>
      theatre.movieIds.includes(film.movieId) || statuses[index] === "done",
  ).length;
  const locked = has === films.length;

  return (
    <ListOption
      name={theatre.name}
      checked={checked}
      locked={locked}
      disabled={isSubmitting}
      isPending={statuses.includes("pending")}
      hint={hint(has, films.length, statuses.includes("done"))}
      onToggle={onToggle}
    />
  );
}

const hint = (has: number, total: number, justAdded: boolean) => {
  if (has === 0) return "";
  if (has === total) return justAdded ? "Added ✓" : "Already on this list";
  return `Has ${has} of ${total}`;
};

const consOrNew =
  <T,>(elem: T) =>
  (arr: T[] | undefined) =>
    arr ? [...arr, elem] : [elem];
