"use client";

import { NominationForm } from "@/app/components/NominationForm";
import { SearchResults } from "@/app/components/SearchResults";
import { useMovieSearch } from "@/app/lib/useMovieSearch";
import { FILTERS, SORTS, type ViewState } from "@/app/lib/view";
import type { Movie } from "@/src/db/schema";
import { useRef, useState } from "react";
import { CollectionViewControls } from "./CollectionViewControls";
import { SlideOpen } from "./SlideOpen";
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
      search={
        onNominate
          ? {
              query,
              onChange: changeQuery,
              label: "Search for a movie to add",
              placeholder: "Add a movie...",
              inputRef,
            }
          : undefined
      }
    >
      {notice && (
        <p className={styles.notice} role="alert">
          {notice}
        </p>
      )}

      {query !== "" && (
        <SearchResults
          results={search.results}
          isLoading={search.isLoading}
          error={search.error}
          onSelect={selectMovie}
          onQuickAdd={quickAdd}
        />
      )}

      <SlideOpen
        open={Boolean(candidate)}
        className={styles.nomination}
        contentKey={candidate?.id}
      >
        {candidate && (
          <NominationForm
            candidate={candidate}
            isSubmitting={isSubmitting}
            onCancel={() => setCandidate(null)}
            onSubmit={(comment) => submit(candidate, comment)}
          />
        )}
      </SlideOpen>
    </CollectionViewControls>
  );
}
