"use client";

import { MovieSearchResults } from "@/app/components/MovieSearchResults";
import { NominationForm } from "@/app/components/NominationForm";
import { useMovieSearch } from "@/app/lib/useMovieSearch";
import { withTargetValue } from "@/app/lib/utils";
import { FILTERS, SORTS, type ViewState } from "@/app/lib/view";
import type { Movie } from "@/src/db/schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import classnames from "classnames";
import styles from "./ViewControls.module.css";

interface ViewControlsProps {
  state: ViewState;
  onChange: (state: ViewState) => void;
  existing: Set<number>;
  isSubmitting: boolean;
  onNominate: (movie: Movie, comment: string) => Promise<boolean>;
}

type Expanded = "sort" | "filter" | null;

/**
 * Renders whatever the registries expose, so adding a sort or filter needs no
 * change here. The sort/filter option rows only appear once their toggle is
 * pressed, to keep the action row itself to a single line.
 */
export function ViewControls({
  state,
  onChange,
  existing,
  isSubmitting,
  onNominate,
}: ViewControlsProps) {
  const [expanded, setExpanded] = useState<Expanded>(null);
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [notice, setNotice] = useState("");
  const [candidate, setCandidate] = useState<Movie | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const search = useMovieSearch(query);
  const reducedMotion = useReducedMotion();
  const transition = {
    duration: reducedMotion ? 0 : 0.2,
    ease: "easeOut",
  } as const;

  const isSearchOpen = isFocused || query !== "";

  const toggleExpanded = (panel: Exclude<Expanded, null>) =>
    setExpanded((current) => (current === panel ? null : panel));

  const selectSort = (id: string) => {
    onChange({ ...state, sort: id });
    setExpanded(null);
  };

  const toggleFilter = (id: string) =>
    onChange({
      ...state,
      filters: state.filters.includes(id)
        ? state.filters.filter((active) => active !== id)
        : [...state.filters, id],
    });

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
    if (await onNominate(movie, comment)) {
      setCandidate(null);
    }
  };

  return (
    <div className={styles.controls}>
      <div className={styles.actions}>
        <div className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="text"
            aria-label="Search for a movie to add"
            placeholder="Add a movie..."
            value={query}
            onChange={withTargetValue(changeQuery)}
            onFocus={() => {
              setIsFocused(true);
              setExpanded(null);
            }}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
          />
          {isSearchOpen && (
            <button
              type="button"
              className={styles.clearSearch}
              aria-label="Close search"
              // Keeps focus in the input so the row doesn't collapse mid-click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={closeSearch}
            >
              ×
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {!isSearchOpen && (
            <motion.div
              key="toggles"
              className={styles.toggles}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={transition}
            >
              <button
                type="button"
                className={classnames(styles.toggle, {
                  [styles.toggleActive]: expanded === "sort",
                })}
                aria-expanded={expanded === "sort"}
                onClick={() => toggleExpanded("sort")}
              >
                Sort by
              </button>
              <button
                type="button"
                className={classnames(styles.toggle, {
                  [styles.toggleActive]:
                    state.filters.length > 0 || expanded === "filter",
                })}
                aria-expanded={expanded === "filter"}
                onClick={() => toggleExpanded("filter")}
              >
                Filter
                {state.filters.length > 0 ? ` (${state.filters.length})` : ""}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {expanded === "sort" && (
        <div className={styles.options} role="group" aria-label="Sort by">
          {SORTS.map((sort) => (
            <button
              key={sort.id}
              type="button"
              className={`${styles.option} ${sort.id === state.sort ? styles.optionActive : ""}`}
              aria-pressed={sort.id === state.sort}
              onClick={() => selectSort(sort.id)}
            >
              {sort.label}
            </button>
          ))}
        </div>
      )}

      {expanded === "filter" && (
        <div className={styles.options} role="group" aria-label="Filters">
          {FILTERS.map((filter) => {
            const isActive = state.filters.includes(filter.id);
            return (
              <button
                key={filter.id}
                type="button"
                className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
                aria-pressed={isActive}
                onClick={() => toggleFilter(filter.id)}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}
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
    </div>
  );
}
