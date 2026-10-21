"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/app/lib/api";
import { useTheatresForMovies } from "@/app/lib/data/queries";
import type { Movie } from "@/src/db/schema";
import { ListPickerSheet } from "../ListPicker/ListPickerSheet";
import type { RowStatus } from "../ListPicker/types";
import { TheatreRow } from "./TheatreRow";

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
  const { data: allTheatres, error, retry } = useTheatresForMovies([
    movie.id,
  ]);
  const loadError = error?.message;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedTheatreIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    setRowErrors((prev) => ({ ...prev, [id]: "" }));
  }

  function addTheatre(theatreId: string) {
    setSelected((prev) => ({ ...prev, [theatreId]: true }));
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
    <ListPickerSheet
      label={`Add ${movie.details.title} to a list`}
      title={movie.details.title}
      subtitle="Pick the lists this belongs on."
      posterUrl={movie.details.posterUrl ?? null}
      theatres={allTheatres}
      loadError={loadError}
      onRetry={retry}
      renderTheatre={(theatre) => (
        <TheatreRow
          key={theatre.id}
          theatre={theatre}
          hasMovie={theatre.movieIds.includes(movie.id)}
          checked={Boolean(selected[theatre.id])}
          comment={comments[theatre.id] ?? ""}
          status={status[theatre.id] ?? "idle"}
          error={rowErrors[theatre.id] ?? ""}
          onToggle={() => toggle(theatre.id)}
          onCommentChange={(value) =>
            setComments((prev) => ({ ...prev, [theatre.id]: value }))
          }
        />
      )}
      onCreated={addTheatre}
      selectedCount={selectedTheatreIds.length}
      isSubmitting={isSubmitting}
      onSubmit={submit}
      onClose={onClose}
    />
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
