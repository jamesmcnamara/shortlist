"use client";

import {
  getOtherNominees,
  isMajorCategory,
  useOscarsFor,
  type OscarEntry,
  type OscarMovie,
  type OscarNominee,
  type OscarNominees,
} from "@/app/lib/data/oscars";
import type { Movie } from "@/src/db/schema";
import classname from "classnames";
import { useState, type ReactNode } from "react";
import { every } from "shades";
import styles from "./Oscars.module.css";
import { OscarStatuette } from "./OscarStatuette";
import { SlideOpen } from "./SlideOpen";

export interface OscarsProps {
  movie: Movie;
  variant?: "default" | "detail";
}

export function Oscars({ movie, variant = "default" }: OscarsProps) {
  const result = useOscarsFor(movie);
  const [open, setOpen] = useState(false);
  if (result.type === "error") return null;
  const { awards: oscars, nominees } = result;

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
      <div className={styles.content}>
        {singleEntry ? (
          <div className={styles.single}>
            <OtherNominees entry={singleEntry} nominees={nominees}>
              <span className={styles.headline}>
                <strong>
                  {singleEntry.winner ? "Won" : "Nominated for"}{" "}
                  {formatCategory(singleEntry.category)}
                </strong>
              </span>
              <span className={styles.singleDetail}>
                {formatEntryDetail(singleEntry)}
              </span>
            </OtherNominees>
          </div>
        ) : (
          <div className={styles.details}>
            <button
              type="button"
              className={classname(styles.toggle, styles.summary)}
              aria-expanded={open}
              onClick={() => setOpen((wasOpen) => !wasOpen)}
            >
              <span className={styles.summaryCopy}>
                <strong>{formatMultipleHeadline(oscars)}</strong>
                <span>{formatMultipleDetail(oscars, majorNominations)}</span>
              </span>
              <span className={styles.chevron} aria-hidden="true" />
            </button>
            <SlideOpen open={open} className={styles.reveal}>
              <ol className={styles.entries}>
                {oscars.entries.map((entry, index) => (
                  <li
                    key={`${entry.year}-${entry.category}-${entry.name}-${index}`}
                    className={styles.entry}
                  >
                    <OtherNominees entry={entry} nominees={nominees}>
                      <span className={styles.entryHeading}>
                        <span>
                          {entry.year} · {formatCategory(entry.category)}
                        </span>
                        <WinnerBadge winner={entry.winner} />
                      </span>
                      <span className={styles.nominee}>
                        {entry.name}
                        {entry.detail ? ` — ${entry.detail}` : ""}
                      </span>
                    </OtherNominees>
                  </li>
                ))}
              </ol>
            </SlideOpen>
          </div>
        )}
      </div>
    </section>
  );
}

interface OtherNomineesProps {
  entry: OscarEntry;
  nominees: OscarNominees;
  children: ReactNode;
}

function OtherNominees({ entry, nominees, children }: OtherNomineesProps) {
  const [open, setOpen] = useState(false);
  const others = getOtherNominees(nominees, entry);
  if (others.length === 0) return children;

  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={styles.toggleCopy}>{children}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      <SlideOpen open={open} className={styles.reveal}>
        <ol
          className={styles.otherNominees}
          aria-label={`Other nominees for ${formatCategory(entry.category)}, ${entry.year}`}
        >
          {others.map((nominee) => (
            <li key={nominee.id} className={styles.entry}>
              <span className={styles.entryHeading}>
                <span>{nominee.film ?? nominee.name}</span>
                <WinnerBadge winner={nominee.winner} />
              </span>
              {formatNomineeDetail(nominee) && (
                <span className={styles.nominee}>
                  {formatNomineeDetail(nominee)}
                </span>
              )}
            </li>
          ))}
        </ol>
      </SlideOpen>
    </>
  );
}

const WinnerBadge = ({ winner }: { winner: boolean }) => (
  <span className={styles.badges}>
    {winner && <span className={styles.winner}>Winner</span>}
  </span>
);

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

const formatNomineeDetail = ({ film, name, detail }: OscarNominee) =>
  [film ? name : null, detail].filter(Boolean).join(" — ");
