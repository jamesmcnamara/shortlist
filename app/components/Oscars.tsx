"use client";

import {
  isMajorCategory,
  useOscarsFor,
  type OscarEntry,
  type OscarMovie,
} from "@/app/lib/data/oscars";
import type { Movie } from "@/src/db/schema";
import classname from "classnames";
import { every } from "shades";
import styles from "./Oscars.module.css";
import { OscarStatuette } from "./OscarStatuette";

export interface OscarsProps {
  movie: Movie;
  variant?: "default" | "detail";
}

export function Oscars({ movie, variant = "default" }: OscarsProps) {
  const { awards: oscars, error } = useOscarsFor(movie);
  if (!oscars && !error) return null;

  const singleEntry = oscars?.entries.length === 1 ? oscars.entries[0] : null;
  const majorNominations =
    oscars?.entries.filter(({ major }) => major).length ?? 0;

  return (
    <section
      className={classname(styles.oscars, {
        [styles.detail]: variant === "detail",
      })}
      aria-label="Academy Awards"
    >
      <OscarStatuette />
      {error ? (
        <p className={styles.unavailable}>Oscar data is unavailable.</p>
      ) : (
        oscars && (
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
                    <strong>{formatMultipleHeadline(oscars)}</strong>
                    <span>
                      {formatMultipleDetail(oscars, majorNominations)}
                    </span>
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
