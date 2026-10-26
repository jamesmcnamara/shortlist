"use client";

import { MovieSearchResults } from "@/app/components/MovieSearchResults";
import { CollectionViewControls } from "./CollectionViewControls";
import { NominationForm } from "@/app/components/NominationForm";
import { useMovieSearch } from "@/app/lib/useMovieSearch";
import { FILTERS, SORTS, type ViewState } from "@/app/lib/view";
import type { Movie } from "@/src/db/schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import styles from "./ViewControls.module.css";

interface ViewControlsProps {
  state: ViewState;
  onChange: (state: ViewState) => void;
  existing: Set<number>;
  isSubmitting: boolean;
  onNominate?: (movie: Movie, comment: string) => Promise<boolean>;
}

export function ViewControls({
  state,
  onChange,
  existing,
  isSubmitting,
  onNominate,
}: ViewControlsProps) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [candidate, setCandidate] = useState<Movie | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useMovieSearch(query);
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? 0 : 0.2,
    ease: "easeOut",
  } as const;

  const changeQuery = (next: string) => {
    setQuery(next);
    setNotice("");
  };

  const closeSearch = () => {
    changeQuery("");
    inputRef.current?.blur();
  };

  const selectMovie = (movie: Movie) => {
    if (movie.tmdbId !== null && existing.has(movie.tmdbId)) {
      setNotice("This movie is already on the list.");
      return;
    }
    setCandidate(movie);
    closeSearch();
  };

  const submit = async (movie: Movie, comment: string) => {
    if (await onNominate?.(movie, comment)) {
      setCandidate(null);
    }
  };

  const quickAdd = async (movie: Movie) => {
    if (movie.tmdbId !== null && existing.has(movie.tmdbId)) {
      setNotice("This movie is already on the list.");
      return;
    }
    await onNominate?.(movie, "");
    closeSearch();
  };

  return (
    <CollectionViewControls
      state={state}
      onChange={onChange}
      sorts={SORTS}
      filters={FILTERS}
      expandSearch
      search={onNominate ? {
        query,
        onChange: changeQuery,
        label: "Search for a movie to add",
        placeholder: "Add a movie...",
        inputRef,
      } : undefined}
    >
      {notice && (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}

      {query !== "" && (
        <MovieSearchResults
          results={search.results}
          isLoading={search.isLoading}
          error={search.error}
          onSelect={selectMovie}
          onQuickAdd={quickAdd}
        />
      )}

      <AnimatePresence initial={false}>
        {candidate && (
          <motion.div
            key="nomination"
            className={styles.nomination}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={transition}
          >
            <NominationForm
              key={candidate.id}
              candidate={candidate}
              isSubmitting={isSubmitting}
              onCancel={() => setCandidate(null)}
              onSubmit={(comment) => submit(candidate, comment)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </CollectionViewControls>
  );
}
