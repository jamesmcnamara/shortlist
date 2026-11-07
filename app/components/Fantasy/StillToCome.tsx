"use client";

import { useState } from "react";
import { useAPICall } from "@/app/lib/useAPIActions";
import {
  buildUpcoming,
  daysUntil,
  type FantasyMovie,
  type FantasyPlayer,
} from "@/app/lib/fantasy";
import styles from "./Fantasy.module.css";
import { firstName, Poster, toneStyle } from "./shared";

const releaseLabel = (movie: FantasyMovie, today: string) => {
  if (!movie.releaseDate) return "";
  const days = daysUntil(movie.releaseDate, today);
  const date = new Date(movie.releaseDate).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  return days === 1
    ? `${date} \u00b7 tomorrow`
    : `${date} \u00b7 in ${days} days`;
};

interface StillToComeProps {
  players: FantasyPlayer[];
  today: string;
  onOpen(id: number): void;
  onSaveBudget?: (id: number, budget: number) => Promise<void>;
}

export function StillToCome({
  players,
  today,
  onOpen,
  onSaveBudget,
}: StillToComeProps) {
  const { unreleased, missing } = buildUpcoming(
    players.flatMap(({ movies }) => movies),
  );
  if (unreleased.length + missing.length === 0) return null;

  const ownerOf = (movie: FantasyMovie) =>
    players.find(({ id }) => id === movie.ownerId);

  const group = (
    title: string,
    note: string,
    movies: FantasyMovie[],
    dated: boolean,
  ) =>
    movies.length > 0 && (
      <div className={styles.upcomingGroup}>
        <h4 className={styles.groupTitle}>{title}</h4>
        <p className={styles.quiet}>{note}</p>
        <ul className={styles.upcoming}>
          {movies.map((movie) => {
            const owner = ownerOf(movie);
            return (
              <li key={movie.id}>
                <button
                  type="button"
                  className={styles.upcomingItem}
                  onClick={() => onOpen(movie.id)}
                >
                  <Poster movie={movie} className={styles.upcomingPoster} />
                  <span className={styles.stepTitle}>{movie.title}</span>
                  {owner && (
                    <span className={styles.stepWho}>
                      <i style={toneStyle(owner.tone)} />
                      {firstName(owner.name)}
                    </span>
                  )}
                  {dated && (
                    <span className={styles.quiet}>
                      {releaseLabel(movie, today)}
                    </span>
                  )}
                </button>
                {!dated && movie.boxOffice?.budget == null && onSaveBudget && (
                  <BudgetEntry
                    movie={movie}
                    onSave={(budget) => onSaveBudget(movie.movie.id, budget)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className={styles.module}>
      <h3 className={styles.moduleTitle}>Still to come</h3>
      {group(
        "Not out yet",
        "These add to the score once they open.",
        unreleased,
        true,
      )}
      <br />
      {group(
        "Missing numbers",
        "Counted as $0 until budget and gross show up.",
        missing,
        false,
      )}
    </div>
  );
}

interface BudgetEntryProps {
  movie: FantasyMovie;
  onSave(budget: number): Promise<void>;
}

function BudgetEntry({ movie, onSave }: BudgetEntryProps) {
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState("");
  const [validation, setValidation] = useState("");
  const [saved, setSaved] = useState(false);
  const { fromAPI, message, isSubmitting } = useAPICall();
  const save = fromAPI({
    api: onSave,
    action: "save budget",
    onSuccess: () => {
      setEditing(false);
      setSaved(true);
    },
  });

  if (saved)
    return (
      <p className={styles.quiet} role="status">
        Budget saved.
      </p>
    );
  if (!editing) {
    return (
      <button
        type="button"
        className={`${styles.budgetButton} ${styles.addBudgetButton}`}
        aria-label={`Add budget for ${movie.title}`}
        onClick={() => setEditing(true)}
      >
        Add budget
      </button>
    );
  }

  const error = validation || message;
  const inputId = `budget-${movie.id}`;
  return (
    <form
      className={styles.budgetForm}
      aria-label={`Budget for ${movie.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        let amount: number;
        if (budget.match(/m$/i)) {
          amount = Number(budget.slice(0, -1)) * 1_000_000;
          if (!Number.isSafeInteger(amount)) {
            setValidation("Enter a budget in whole US dollars.");
            return;
          }
        } else {
          amount = Number(budget);
          if (!/^\d+$/.test(budget) || !Number.isSafeInteger(amount)) {
            setValidation("Enter a budget in whole US dollars.");
            return;
          }
        }
        setValidation("");
        void save(amount);
      }}
    >
      <label htmlFor={inputId}>Budget (USD)</label>
      <input
        id={inputId}
        autoFocus
        type="text"
        inputMode="numeric"
        value={budget}
        onChange={(event) => {
          setBudget(event.target.value);
          setValidation("");
        }}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        disabled={isSubmitting}
      />
      <div className={styles.budgetActions}>
        <button className={styles.budgetButton} disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={styles.budgetButton}
          disabled={isSubmitting}
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
