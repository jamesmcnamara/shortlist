"use client";

import { useAPICall } from "@/app/lib/useAPIActions";
import type { Movie, Nomination } from "@/src/db/schema";
import { differenceBy, noop, uniqBy } from "lodash";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { find } from "shades";
import { MovieCard } from "./MovieCard";
import { MovieGrid } from "./MovieGrid";
import { NominationForm } from "./NominationForm";
import { SlideOpen } from "./SlideOpen";
import styles from "./Suggestions.module.css";

// The suggestions route rejects longer lists and titles, so trim before sending.
const MAX_EXCLUDED_TITLES = 100;
const MAX_TITLE_LENGTH = 200;

// A bit over SlideOpen's 0.2s. Motion resets the scroll position as the form starts
// opening, and the page only gets tall enough to scroll to it once it has opened.
const FORM_OPEN_MS = 250;

const excludedTitles = (suggestions: Nomination[]) =>
  suggestions
    .map(({ movie }) => movie.details.title.trim().slice(0, MAX_TITLE_LENGTH))
    .filter(Boolean)
    .slice(-MAX_EXCLUDED_TITLES);

interface SuggestionsProps {
  existing: Set<number>;
  onSuggest: (exclude: string[]) => Promise<Nomination[]>;
  onNominate: (candidate: Movie, comment: string) => Promise<void>;
}

export function Suggestions({
  existing,
  onSuggest,
  onNominate,
}: SuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Nomination[]>([]);
  const [foundNothingNew, setFoundNothingNew] = useState(false);
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const asking = useAPICall();
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();

  // The form opens above the grid, so a tap on a lower card can leave it off-screen.
  useEffect(() => {
    if (candidateId === null) return;
    const timer = setTimeout(
      () =>
        sectionRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        }),
      FORM_OPEN_MS,
    );
    return () => clearTimeout(timer);
  }, [candidateId, reducedMotion]);

  const visible = suggestions.filter(
    ({ movie }) => movie.tmdbId === null || !existing.has(movie.tmdbId),
  );
  const candidate = find({ id: candidateId })(visible);
  // Close the form once its movie is gone, whether it was added here or elsewhere.
  if (candidateId !== null && !candidate) setCandidateId(null);

  const ask = asking.fromAPI({
    action: "get suggestions",
    onStart: () => setFoundNothingNew(false),
    api: async () => {
      const fresh = await onSuggest(excludedTitles(suggestions));
      setFoundNothingNew(
        differenceBy(fresh, suggestions, "movieId").length === 0,
      );
      setSuggestions((current) => uniqBy([...current, ...fresh], "movieId"));
    },
  });

  const hint = asking.isSubmitting
    ? "Looking for movies..."
    : foundNothingNew
      ? "Nothing new to suggest right now."
      : visible.length > 0
        ? "Tap a movie to see why it fits and add it."
        : "Get movie ideas that fit this list's description.";

  return (
    <section
      ref={sectionRef}
      className={styles.section}
      aria-labelledby="suggestions-title"
    >
      <div className={styles.header}>
        <h2 className={styles.title} id="suggestions-title">
          Suggestions
        </h2>
        <button
          type="button"
          className={styles.suggest}
          aria-busy={asking.isSubmitting}
          onClick={() => ask()}
        >
          {asking.isSubmitting ? "Thinking..." : "Suggest"}
        </button>
      </div>

      <p className={styles.hint} role="status">
        {hint}
      </p>
      {asking.message && (
        <p className={styles.error} role="alert">
          {asking.message}
        </p>
      )}

      <SlideOpen
        open={Boolean(candidate)}
        className={styles.form}
        contentKey={candidate?.id}
      >
        {candidate && (
          <SuggestionForm
            suggestion={candidate}
            onNominate={onNominate}
            onAdded={() =>
              setSuggestions((current) =>
                current.filter(({ id }) => id !== candidate.id),
              )
            }
            onCancel={() => setCandidateId(null)}
          />
        )}
      </SlideOpen>

      {/* Always mounted, so the first suggestions have something to slide into. */}
      <MovieGrid nominees={visible} animation="slide">
        {(nom) => (
          <MovieCard
            nomination={nom}
            hasSeen={false}
            showMeta={false}
            isExpanded={candidate?.id === nom.id}
            label={`Review suggestion: ${nom.movie.details.title}`}
            onClick={() => setCandidateId(nom.id)}
            onLongPress={noop}
          />
        )}
      </MovieGrid>
    </section>
  );
}

interface SuggestionFormProps {
  suggestion: Nomination;
  onNominate: (candidate: Movie, comment: string) => Promise<void>;
  onAdded: () => void;
  onCancel: () => void;
}

// Owns its own request state, so one suggestion's error never shows on another.
function SuggestionForm({
  suggestion,
  onNominate,
  onAdded,
  onCancel,
}: SuggestionFormProps) {
  const { message, isSubmitting, fromAPI } = useAPICall();
  const add = fromAPI({
    action: "add that movie",
    api: async (comment: string) => {
      await onNominate(suggestion.movie, comment);
      onAdded();
    },
  });

  return (
    <>
      <NominationForm
        candidate={suggestion.movie}
        initialComment={suggestion.comment ?? ""}
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        onSubmit={add}
      />
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
    </>
  );
}
