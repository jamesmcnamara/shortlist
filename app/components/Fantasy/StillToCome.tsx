"use client";

import {
  buildUpcoming,
  daysUntil,
  type FantasyMovie,
  type FantasyPlayer,
} from "@/app/lib/fantasy";
import styles from "./Fantasy.module.css";
import { firstName, Poster, toneStyle } from "./shared";

const releaseLabel = (movie: FantasyMovie, today: string) => {
  if (!movie.releaseDate) return "";
  const days = daysUntil(movie.releaseDate, today);
  const date = new Date(movie.releaseDate).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  return days === 1
    ? `${date} \u00b7 tomorrow`
    : `${date} \u00b7 in ${days} days`;
};

export function StillToCome({
  players,
  today,
  onOpen,
}: {
  players: FantasyPlayer[];
  today: string;
  onOpen: (id: number) => void;
}) {
  const { unreleased, missing } = buildUpcoming(
    players.flatMap(({ movies }) => movies),
  );
  if (unreleased.length + missing.length === 0) return null;

  const ownerOf = (movie: FantasyMovie) =>
    players.find(({ id }) => id === movie.ownerId);

  const group = (
    title: string,
    note: string,
    movies: FantasyMovie[],
    dated: boolean,
  ) =>
    movies.length > 0 && (
      <div className={styles.upcomingGroup}>
        <h4 className={styles.groupTitle}>{title}</h4>
        <p className={styles.quiet}>{note}</p>
        <ul className={styles.upcoming}>
          {movies.map((movie) => {
            const owner = ownerOf(movie);
            return (
              <li key={movie.id}>
                <button
                  type="button"
                  className={styles.upcomingItem}
                  onClick={() => onOpen(movie.id)}
                >
                  <Poster movie={movie} className={styles.upcomingPoster} />
                  <span className={styles.stepTitle}>{movie.title}</span>
                  {owner && (
                    <span className={styles.stepWho}>
                      <i style={toneStyle(owner.tone)} />
                      {firstName(owner.name)}
                    </span>
                  )}
                  {dated && (
                    <span className={styles.quiet}>
                      {releaseLabel(movie, today)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div className={styles.module}>
      <h3 className={styles.moduleTitle}>Still to come</h3>
      {group(
        "Not out yet",
        "These add to the score once they open.",
        unreleased,
        true,
      )}
      <br />
      {group(
        "Missing numbers",
        "Counted as $0 until budget and gross show up.",
        missing,
        false,
      )}
    </div>
  );
}
