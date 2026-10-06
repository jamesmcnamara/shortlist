"use client";

import { MovieSearchResults } from "@/app/components/MovieSearchResults";
import { useMovieSearch } from "@/app/lib/useMovieSearch";
import { capitalize, withTargetValue } from "@/app/lib/utils";
import type { Movie } from "@/src/db/schema";
import { useEffect, useState } from "react";
import { filter, find, not, some } from "shades";
import {
  compareHref,
  METRICS,
  scoreRow,
  sortMovies,
  type Scale,
  type SortDirection,
} from "./metrics";
import styles from "./page.module.css";

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
  const [sort, setSort] = useState<{
    metric: string;
    direction: SortDirection;
  } | null>(null);
  const { results, error, isLoading } = useMovieSearch(query);

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      compareHref(movies.flatMap(({ tmdbId }) => tmdbId ?? [])),
    );
  }, [movies]);

  const freshResults = results.filter(
    (result) => !movies.some((movie) => movie.id === result.id),
  );

  function add(movie: Movie) {
    setMovies((current) =>
      some({ id: movie.id })(current) ? current : [...current, movie],
    );
    setQuery("");
  }

  function remove(id: number) {
    setMovies(filter(not({ id })));
  }

  function toggleSort(metric: string) {
    setSort((current) => ({
      metric,
      direction:
        current?.metric === metric && current.direction === "desc"
          ? "asc"
          : "desc",
    }));
  }

  const sortMetric = find({ name: sort?.metric })(METRICS);
  const shown =
    sort && sortMetric
      ? sortMovies(movies, sortMetric, sort.direction)
      : movies;

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

          <div className={styles.tableScroll}>
            <table
              className={styles.table}
              style={{ "--columns": movies.length } as React.CSSProperties}
            >
              <thead>
                <tr>
                  <td />
                  {shown.map((movie) => (
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
                  const values = shown.map(metric.read);
                  const direction =
                    sort?.metric === metric.name ? sort.direction : null;
                  const scores = scoreRow(values, metric, scale);
                  return (
                    <tr key={metric.name}>
                      <th
                        scope="row"
                        aria-sort={
                          direction === "desc"
                            ? "descending"
                            : direction === "asc"
                              ? "ascending"
                              : undefined
                        }
                      >
                        <button
                          type="button"
                          className={styles.sortButton}
                          title={`Sort by ${metric.name}`}
                          onClick={() => toggleSort(metric.name)}
                        >
                          {metric.logo ? (
                            <img src={metric.logo} alt={metric.name} />
                          ) : (
                            <ClockIcon label={metric.name} />
                          )}
                          <span className={styles.sortArrow} aria-hidden>
                            {direction === "desc"
                              ? "▾"
                              : direction === "asc"
                                ? "▴"
                                : ""}
                          </span>
                        </button>
                      </th>
                      {values.map((value, index) => {
                        const score = scores[index];
                        return (
                          <td
                            key={shown[index].id}
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
          </div>
        </section>
      )}

      <section className={styles.search} aria-label="Add a movie">
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
            Pick a few movies to stack them side by side.
          </p>
        )}
        <MovieSearchResults
          results={freshResults}
          isLoading={isLoading}
          error={error}
          onSelect={add}
        />
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
