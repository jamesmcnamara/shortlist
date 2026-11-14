import type { MovieTrivia } from "@/app/lib/trivia";
import chevronStyles from "./Chevron.module.css";
import styles from "./Trivia.module.css";
import { BoxOfficeData } from "../lib/box-office";
import { BoxOffice } from "./BoxOffice";

interface TriviaProps {
  trivia?: MovieTrivia;
  boxOffice?: BoxOfficeData;
  titleClassName?: string;
}

export function Trivia({ trivia, boxOffice, titleClassName }: TriviaProps) {
  const content = trivia ? (
    <>
      {boxOffice && <BoxOffice data={boxOffice} />}
      {trivia.items.length > 0 ? (
        <ul className={styles.items}>
          {trivia.items.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      ) : (
        <p>No IMDb trivia found.</p>
      )}
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
