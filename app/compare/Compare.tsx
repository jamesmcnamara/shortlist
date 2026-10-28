"use client";
import { SearchResults } from "@/app/components/SearchResults";
import { useOscars } from "@/app/lib/data/oscars";
import { heat } from "@/app/lib/heat";
import { useMovieSearch } from "@/app/lib/useMovieSearch";
import { capitalize, when, withTargetValue } from "@/app/lib/utils";
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

const OSCAR_HINT =
  "Oscar points are calculated as: Best Picture = 15pts, Major win = 10pts, Major nomination = 5pts, Minor win = 3pts, Minor nomination = 1pt.";

const SCALE_HINTS: Record<Scale, string> = {
  relative: `Colors rank these movies against each other. ${OSCAR_HINT}`,
  absolute: `Colors use each service's full scale. ${OSCAR_HINT} Runtime runs from 1h 20m (great) to 3h (oof).`,
};

interface CompareProps {
  initialMovies: Movie[];
  userId?: string | null;
}

export function Compare({ initialMovies, userId }: CompareProps) {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<Movie[]>(initialMovies);
  const [scale, setScale] = useState<Scale>("relative");
  const [sort, setSort] = useState<{
    metric: string;
    direction: SortDirection;
  } | null>(null);
  const { results, error, isLoading } = useMovieSearch(query);
  const { data: oscars } = useOscars();

  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      compareHref(movies.flatMap(({ tmdbId }) => tmdbId ?? [])),
    );
  }, [movies]);

  const freshResults = results.filter(({ id }) => !some({ id })(movies));

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
      ? sortMovies(movies, sortMetric, sort.direction, { oscars })
      : movies;

  return (
    <div className={styles.compare}>
      {movies.length > 0 && (
        <section className={styles.comparison} aria-label="Movie comparison">
          <div className={styles.comparisonControls}>
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
          </div>

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
                  const values = shown.map((movie) =>
                    metric.read(movie, { oscars }),
                  );
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
                          aria-label={`Sort by ${metric.name}`}
                          onClick={() => toggleSort(metric.name)}
                        >
                          {typeof metric.logo === "string" ? (
                            <img src={metric.logo} alt={metric.name} />
                          ) : typeof metric.logo === "function" ? (
                            metric.logo()
                          ) : (
                            <span className={styles.metricLabel} aria-hidden>
                              {metric.name === "Total return" ? "Net" : "x"}
                            </span>
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

      {when(userId)(
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
          <div className={styles.searchResults}>
            <SearchResults
              results={freshResults}
              isLoading={isLoading}
              error={error}
              onSelect={add}
            />
          </div>
        </section>,
      )}
    </div>
  );
}
