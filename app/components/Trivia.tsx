import type { MovieTrivia } from "@/app/lib/trivia";
import styles from "./Trivia.module.css";

interface TriviaProps {
  trivia?: MovieTrivia;
}

export function Trivia({ trivia }: TriviaProps) {
  return (
    <details className={styles.trivia}>
      <summary>
        Trivia <span className={styles.note}>(may contain spoilers)</span>
      </summary>
      {trivia ? (
        <>
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
        <p className={styles.note}>
          Trivia hasn't been loaded. Add this movie or refresh its data to try
          IMDb.
        </p>
      )}
    </details>
  );
}
