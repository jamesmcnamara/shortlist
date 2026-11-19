import { formatRuntime, tmdbImageUrl } from "@/app/lib/utils";
import type { Nomination } from "@/src/db/schema";
import styles from "./MovieClubSpotlight.module.css";

interface MovieClubSpotlightProps {
  nomination: Nomination;
  /** The month it was picked for, like "2026-11". */
  cycle: string;
  onOpen(): void;
}

const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  timeZone: "UTC",
});

/** "2026-11" to "November". */
const monthName = (cycle: string) => MONTH.format(new Date(`${cycle}-01`));

export function MovieClubSpotlight({
  nomination,
  cycle,
  onOpen,
}: MovieClubSpotlightProps) {
  const { details } = nomination.movie;
  const year = details.year ?? details.release_date?.slice(0, 4);
  const synopsis = details.overview || details.description;
  const backdropUrl = tmdbImageUrl(details.backdrop_path, "w1280");
  const label = `${monthName(cycle)}’s pick`;
  const facts = [
    label,
    year,
    details.runtime ? formatRuntime(details.runtime) : null,
  ].filter(Boolean);

  return (
    <section aria-label={label}>
      <h2 className={styles.heading}>This month's movie is..</h2>
      <div className={`${styles.spotlight} ${styles.marquee}`}>
        <div
          className={styles.backdrop}
          style={
            backdropUrl ? { backgroundImage: `url(${backdropUrl})` } : undefined
          }
          aria-hidden="true"
        />
        <div className={styles.poster} aria-hidden="true">
          {details.posterUrl ? (
            <img src={details.posterUrl} alt="" draggable={false} />
          ) : (
            <span>{details.title.slice(0, 1)}</span>
          )}
        </div>
        <div className={styles.copy}>
          <h3 className={styles.title}>
            <button type="button" className={styles.open} onClick={onOpen}>
              {details.title}
            </button>
          </h3>
          <p className={styles.facts}>
            {facts.map((fact) => (
              <span key={fact}>{fact}</span>
            ))}
          </p>
          {synopsis && <p className={styles.synopsis}>{synopsis}</p>}
          <span className={styles.cue} aria-hidden="true">
            Open discussion
            <svg viewBox="0 0 16 16">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        </div>
      </div>
    </section>
  );
}
