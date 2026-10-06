"use client";

import { useEffect, useState } from "react";
import { MovieSearchResults } from "@/app/components/MovieSearchResults";
import { useMovieSearch } from "@/app/lib/useMovieSearch";
import { capitalize, withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import {
  compareHref,
  MAX_MOVIES,
  METRICS,
  scoreRow,
  type Scale,
} from "./metrics";
import styles from "./page.module.css";
import { filter, not } from "shades";

const SCALE_HINTS: Record<Scale, string> = {
  relative: "Colors rank these movies against each other.",
  absolute:
    "Colors use each service's full scale. Runtime runs from 1h 20m (great) to 3h (oof).",
};

// GitHub's diff backgrounds, extrapolated one step past each end for punch.
const HEAT_STOPS = [
  "#ffb1ad",
  "#ffcecb",
  "#ffebe9",
  "#ffffff",
  "#dafbe1",
  "#aceebb",
  "#7ee195",
];

const heat = (score: number) => {
  const position = score * (HEAT_STOPS.length - 1);
  const index = Math.min(Math.floor(position), HEAT_STOPS.length - 2);
  const weight = Math.round((position - index) * 100);
  return `color-mix(in srgb, ${HEAT_STOPS[index + 1]} ${weight}%, ${HEAT_STOPS[index]})`;
};

export function MovieCompare({ initialMovies }: { initialMovies: Movie[] }) {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<Movie[]>(initialMovies);
  const [scale, setScale] = useState<Scale>("relative");
  const { results, error, isLoading } = useMovieSearch(query);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      compareHref(movies.flatMap(({ tmdbId }) => tmdbId ?? [])),
    );
  }, [movies]);

  const isFull = movies.length >= MAX_MOVIES;
  const freshResults = results.filter(
    (result) => !movies.some((movie) => movie.id === result.id),
  );

  function add(movie: Movie) {
    setMovies((current) =>
      current.length >= MAX_MOVIES || current.some(({ id }) => id === movie.id)
        ? current
        : [...current, movie],
    );
    setQuery("");
  }

  function remove(id: number) {
    setMovies(filter(not({ id })));
  }

  return (
    <div className={styles.compare}>
      {movies.length > 0 && (
        <section aria-label="Movie comparison">
          <div
            className={styles.scaleToggle}
            role="group"
            aria-label="Color scale"
          >
            {(["relative", "absolute"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={scale === option}
                onClick={() => setScale(option)}
              >
                {capitalize(option)}
              </button>
            ))}
          </div>
          <p className={styles.scaleHint}>{SCALE_HINTS[scale]}</p>

          <table className={styles.table}>
            <thead>
              <tr>
                <td />
                {movies.map((movie) => (
                  <th key={movie.id} scope="col">
                    <div className={styles.poster}>
                      {movie.details.posterUrl ? (
                        <img src={movie.details.posterUrl} alt="" />
                      ) : (
                        <span className={styles.posterFallback} aria-hidden>
                          {movie.details.title}
                        </span>
                      )}
                      <span className="srOnly">{movie.details.title}</span>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Remove ${movie.details.title}`}
                        title="Remove"
                        onClick={() => remove(movie.id)}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric) => {
                const values = movies.map(metric.read);
                const scores = scoreRow(values, metric, scale);
                return (
                  <tr key={metric.name}>
                    <th scope="row" title={metric.name}>
                      {metric.logo ? (
                        <img src={metric.logo} alt={metric.name} />
                      ) : (
                        <ClockIcon label={metric.name} />
                      )}
                    </th>
                    {values.map((value, index) => {
                      const score = scores[index];
                      return (
                        <td
                          key={movies[index].id}
                          className={
                            score === null ? styles.unscored : styles.scored
                          }
                          style={
                            score === null
                              ? undefined
                              : { background: heat(score) }
                          }
                        >
                          {value === null ? (
                            <span aria-label="No data">–</span>
                          ) : (
                            metric.format(value)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className={styles.search} aria-label="Add a movie">
        {isFull ? (
          <p className={styles.hint}>
            Full house. Remove one to add another.
          </p>
        ) : (
          <>
            <div className={styles.searchInput}>
              <span aria-hidden>⌕</span>
              <input
                type="text"
                aria-label="Search for a movie to compare"
                placeholder={
                  movies.length === 0
                    ? "Search for a contender..."
                    : "Add another contender..."
                }
                value={query}
                onChange={withTargetValue(setQuery)}
              />
            </div>
            {movies.length === 0 && query.trim().length < 2 && (
              <p className={styles.hint}>
                Pick up to {MAX_MOVIES} movies to stack them side by side.
              </p>
            )}
            <MovieSearchResults
              results={freshResults}
              isLoading={isLoading}
              error={error}
              onSelect={add}
            />
          </>
        )}
      </section>
    </div>
  );
}

interface ClockProps {
  label: string;
}

const ClockIcon = ({ label }: ClockProps) => (
  <svg
    className={styles.clock}
    viewBox="0 0 24 24"
    role="img"
    aria-label={label}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
