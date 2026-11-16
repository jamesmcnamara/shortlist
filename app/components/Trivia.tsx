import type { MovieTrivia } from "@/app/lib/trivia";
import { filter, not } from "shades";
import { BoxOfficeData } from "../lib/box-office";
import { BoxOffice } from "./BoxOffice";
import chevronStyles from "./Chevron.module.css";
import styles from "./Trivia.module.css";

interface TriviaProps {
  trivia?: MovieTrivia;
  boxOffice?: BoxOfficeData;
  titleClassName?: string;
}

export function Trivia({ trivia, boxOffice, titleClassName }: TriviaProps) {
  const items = trivia?.items ?? [];
  const nonSpoilers = filter(not("spoiler"))(items);
  const spoilers = filter("spoiler")(items);
  const content = trivia ? (
    <>
      {boxOffice && <BoxOffice data={boxOffice} />}
      {nonSpoilers.length > 0 && (
        <ul className={styles.items}>
          {nonSpoilers.map(({ text }, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      )}
      {spoilers.length > 0 && (
        <details className={styles.spoilers} key={trivia.url}>
          <summary>
            <span className={styles.spoilerLabel}>
              Spoilers ({spoilers.length})
            </span>
          </summary>
          <ul className={styles.items}>
            {spoilers.map(({ text }, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </details>
      )}
      {trivia.items.length === 0 && <p>No IMDb trivia found.</p>}
      <a
        href={trivia.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.source}
      >
        IMDb trivia
      </a>
      <p className={styles.note}>
        {trivia.items.length} entries, fetched{" "}
        {new Date(trivia.fetchedAt).toLocaleDateString()}.
      </p>
    </>
  ) : (
    <>
      {boxOffice && <BoxOffice data={boxOffice} />}
      <p className={styles.note}>
        Trivia hasn't been loaded. Add this movie or refresh its data to try
        IMDb.
      </p>
    </>
  );

  return (
    <details className={styles.trivia}>
      <summary>
        <span className={styles.heading}>
          <span className={titleClassName}>Trivia</span>
          {trivia && (
            <span className={styles.count}>
              {trivia.items.length}{" "}
              {trivia.items.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </span>
        <span className={styles.action}>
          {!trivia && <span className={styles.count}>Show</span>}
          <span className={styles.collapse}>Collapse</span>
          <span
            className={`${chevronStyles.chevron} ${styles.chevron}`}
            aria-hidden="true"
          />
        </span>
      </summary>
      {content}
    </details>
  );
}
