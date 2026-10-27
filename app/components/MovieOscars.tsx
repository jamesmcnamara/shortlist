"use client";

import type { Movie } from "@/src/db/schema";
import useSWR from "swr";
import styles from "./MovieOscars.module.css";

interface OscarEntry {
  year: string;
  category: string;
  winner: boolean;
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

interface MovieOscarsProps {
  movie: Movie;
  variant?: "default" | "detail";
}

export function MovieOscars({ movie, variant = "default" }: MovieOscarsProps) {
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

  const singleEntry = oscars?.entries.length === 1 ? oscars.entries[0] : null;

  return (
    <section
      className={`${styles.oscars} ${variant === "detail" ? styles.detail : ""}`}
      aria-label="Academy Awards"
    >
      <OscarStatuetteIcon />
      {error ? (
        <p className={styles.unavailable}>Oscar data is unavailable.</p>
      ) : (
        oscars && (
          <div className={styles.content}>
            {singleEntry ? (
              <div className={styles.single}>
                <strong>
                  {singleEntry.winner ? "Won" : "Nominated for"}{" "}
                  {formatCategory(singleEntry.category)}
                </strong>
                <span>{formatEntryDetail(singleEntry)}</span>
              </div>
            ) : (
              <details className={styles.details}>
                <summary>
                  <span className={styles.summaryCopy}>
                    <strong>{formatMultipleHeadline(oscars)}</strong>
                    <span>{formatMultipleDetail(oscars)}</span>
                  </span>
                  <span className={styles.chevron} aria-hidden="true" />
                </summary>
                <ol className={styles.entries}>
                  {oscars.entries.map((entry, index) => (
                    <li
                      key={`${entry.year}-${entry.category}-${entry.name}-${index}`}
                      className={styles.entry}
                    >
                      <div className={styles.entryHeading}>
                        <span>
                          {entry.year} · {formatCategory(entry.category)}
                        </span>
                        {entry.winner && (
                          <span className={styles.winner}>Winner</span>
                        )}
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

const formatMultipleHeadline = ({ wins, nominations }: OscarMovie) =>
  wins > 0
    ? `Won ${wins} ${wins === 1 ? "Oscar" : "Oscars"}`
    : `Nominated for ${nominations} Oscars`;

const formatMultipleDetail = ({ wins, nominations }: OscarMovie) =>
  wins > 0
    ? `${nominations} total nominations · View details`
    : "View nomination details";

const formatCategory = (category: string) =>
  category
    .toLocaleLowerCase("en-US")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-US"));

const formatEntryDetail = (entry: OscarEntry) =>
  [entry.year, entry.name, entry.detail].filter(Boolean).join(" · ");

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
