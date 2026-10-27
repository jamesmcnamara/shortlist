"use client";

import type { Movie } from "@/src/db/schema";
import useSWR from "swr";
import styles from "./Oscars.module.css";
import { every } from "shades";
import classname from "classnames";

interface OscarEntry {
  year: string;
  category: string;
  winner: boolean;
  major?: boolean;
  name: string;
  detail?: string;
}

interface OscarMovie {
  wins: number;
  nominations: number;
  entries: OscarEntry[];
}

interface OscarDataset {
  updatedThrough: number;
  movies: Record<string, OscarMovie>;
}

interface OscarsProps {
  movie: Movie;
  variant?: "default" | "detail";
}

export function Oscars({ movie, variant = "default" }: OscarsProps) {
  const imdbId = getImdbId(movie);
  const { data, error } = useSWR<OscarDataset>(
    imdbId ? "/data/oscars.json" : null,
    fetchDataset,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    },
  );

  if (!imdbId || (!data && !error)) return null;

  const oscars = data?.movies[imdbId];
  if (!oscars && !error) return null;

  const sortedOscars = oscars
    ? {
        ...oscars,
        entries: oscars.entries
          .map((entry) => ({
            ...entry,
            major: entry.major ?? isMajorCategory(entry.category),
          }))
          .sort(compareOscarEntries),
      }
    : null;
  const singleEntry =
    sortedOscars?.entries.length === 1 ? sortedOscars.entries[0] : null;
  const majorNominations =
    sortedOscars?.entries.filter(({ major }) => major).length ?? 0;

  return (
    <section
      className={classname(styles.oscars, {
        [styles.detail]: variant === "detail",
      })}
      aria-label="Academy Awards"
    >
      <OscarStatuetteIcon />
      {error ? (
        <p className={styles.unavailable}>Oscar data is unavailable.</p>
      ) : (
        sortedOscars && (
          <div className={styles.content}>
            {singleEntry ? (
              <div className={styles.single}>
                <div className={styles.headline}>
                  <strong>
                    {singleEntry.winner ? "Won" : "Nominated for"}{" "}
                    {formatCategory(singleEntry.category)}
                  </strong>
                </div>
                <span>{formatEntryDetail(singleEntry)}</span>
              </div>
            ) : (
              <details className={styles.details}>
                <summary>
                  <span className={styles.summaryCopy}>
                    <strong>{formatMultipleHeadline(sortedOscars)}</strong>
                    <span>
                      {formatMultipleDetail(sortedOscars, majorNominations)}
                    </span>
                  </span>
                  <span className={styles.chevron} aria-hidden="true" />
                </summary>
                <ol className={styles.entries}>
                  {sortedOscars.entries.map((entry, index) => (
                    <li
                      key={`${entry.year}-${entry.category}-${entry.name}-${index}`}
                      className={styles.entry}
                    >
                      <div className={styles.entryHeading}>
                        <span>
                          {entry.year} · {formatCategory(entry.category)}
                        </span>
                        <span className={styles.badges}>
                          {entry.winner && (
                            <span className={styles.winner}>Winner</span>
                          )}
                        </span>
                      </div>
                      <span className={styles.nominee}>
                        {entry.name}
                        {entry.detail ? ` — ${entry.detail}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        )
      )}
    </section>
  );
}

const getImdbId = (movie: Movie) => {
  const detailsId = movie.details.imdb_id;
  if (detailsId && /^tt\d+$/.test(detailsId)) return detailsId;

  const raw = movie.ratings.raw as { ids?: { imdb?: unknown } };
  return typeof raw.ids?.imdb === "string" && /^tt\d+$/.test(raw.ids.imdb)
    ? raw.ids.imdb
    : null;
};

const formatMultipleHeadline = ({ entries, wins, nominations }: OscarMovie) => {
  const majors = entries.filter(
    (entry) => entry.major ?? isMajorCategory(entry.category),
  );
  if (wins > 0) {
    const majorText = every("winner")(majors) ? "Major " : "";
    return `Won ${wins} ${majorText}${wins === 1 ? "Oscar" : "Oscars"}`;
  }
  const majorText = majors.length === entries.length ? "Major " : "";
  return `Nominated for ${nominations} ${majorText}Oscars`;
};

const formatMultipleDetail = (
  { wins, nominations }: OscarMovie,
  majorNominations: number,
) => {
  if (wins === 0 && nominations === majorNominations) return ``;
  return [
    majorNominations > 0
      ? `${majorNominations} major ${
          majorNominations === 1 ? "nomination" : "nominations"
        }`
      : null,
    nominations > majorNominations ? `${nominations} total` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

const formatCategory = (category: string) =>
  category
    .toLocaleLowerCase("en-US")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"));

const formatEntryDetail = (entry: OscarEntry) =>
  [entry.year, entry.name, entry.detail].filter(Boolean).join(" · ");

const compareOscarEntries = (left: OscarEntry, right: OscarEntry) =>
  categoryRank(left) - categoryRank(right) ||
  left.category.localeCompare(right.category) ||
  right.year.localeCompare(left.year) ||
  Number(right.winner) - Number(left.winner);

const categoryRank = (entry: OscarEntry) => {
  if (entry.category === "BEST PICTURE") return 0;
  if (entry.category.startsWith("DIRECTING")) return 1;
  return (entry.major ?? isMajorCategory(entry.category)) ? 2 : 3;
};

const isMajorCategory = (category: string) =>
  category === "BEST PICTURE" ||
  category.startsWith("DIRECTING") ||
  /^(ACTOR|ACTRESS) IN A (LEADING|SUPPORTING) ROLE$/.test(category) ||
  category === "WRITING (Adapted Screenplay)" ||
  category === "WRITING (Original Screenplay)" ||
  category.startsWith("CINEMATOGRAPHY");

const OscarStatuetteIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 32"
    role="img"
    aria-label="Oscar"
  >
    <circle cx="12" cy="4.5" r="3" />
    <path d="M8.7 8.4h6.6l1.4 8.1-2.5 7.1H9.8l-2.5-7.1 1.4-8.1Z" />
    <path d="M9.7 23.2h4.6l1 3.1H8.7l1-3.1Z" />
    <path d="M6.5 27h11l1.5 3H5l1.5-3Z" />
  </svg>
);

const fetchDataset = async (url: string): Promise<OscarDataset> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Oscar data returned ${response.status}.`);
  }
  return response.json();
};
