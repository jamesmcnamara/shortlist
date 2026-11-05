"use client";

import {
  accumulate,
  signedMoney,
  type FantasyMovie,
  type FantasyPlayer,
} from "@/app/lib/fantasy";
import { heat } from "@/app/lib/heat";
import { scaleLinear } from "@visx/scale";
import { motion } from "motion/react";
import styles from "./Fantasy.module.css";
import {
  Avatar,
  EASE,
  isDimmed,
  NetChip,
  useReveal,
  type ModuleProps,
} from "./shared";

export function Standings({
  players,
  selection,
  onSelect,
  inspector,
}: ModuleProps) {
  const { ref, show, reduced } = useReveal<HTMLOListElement>();

  const rows = players.map((player) => ({
    player,
    segments: segmentsFor(player),
  }));
  const extent = (pick: (segment: Segment) => number) =>
    Math.max(0, ...rows.flatMap(({ segments }) => segments.map(pick)));
  // One scale for every row, so bar lengths compare across players.
  const scale = scaleLinear({
    domain: [-(extent(({ to }) => -to) || 1), extent(({ to }) => to) || 1],
    range: [0, 100],
  });
  const axis = scale(0);

  return (
    <div>
      <ol className={styles.players} ref={ref}>
        {rows.map(({ player, segments }, index) => (
          <motion.li
            key={player.id}
            className={styles.player}
            layout="position"
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            <div className={styles.playerHead}>
              <span className={styles.rank} aria-label={`Rank ${player.rank}`}>
                {player.rank}
              </span>
              <Avatar player={player} />
              <span
                className={styles.playerName}
                data-leader={player.rank === 1 || undefined}
              >
                {player.name}
              </span>
              <NetChip net={player.net} score={player.score} play={show} />
            </div>

            <motion.div
              className={styles.track}
              initial={
                reduced
                  ? false
                  : { clipPath: `inset(-8px ${100 - axis}% -8px ${axis}%)` }
              }
              animate={{ clipPath: "inset(-8px 0% -8px 0%)" }}
              transition={{
                duration: 0.8,
                ease: EASE,
                delay: show ? index * 0.09 : 0,
              }}
              style={show || reduced ? undefined : { visibility: "hidden" }}
              role="group"
              aria-label={`${player.name}'s movies`}
            >
              <span className={styles.axis} style={{ left: `${axis}%` }} />
              {segments.map(({ movie, from, to }) => {
                const left = scale(Math.min(from, to));
                const width = scale(Math.max(from, to)) - left;
                return (
                  <button
                    key={movie.id}
                    type="button"
                    className={styles.segment}
                    style={{
                      left: `${left}%`,
                      width: `max(0.1875rem, ${width}%)`,
                      background: heat(movie.score),
                    }}
                    data-dim={isDimmed(movie, selection) || undefined}
                    aria-pressed={selection?.id === movie.id}
                    aria-label={`${movie.title}, ${signedMoney(movie.net)}`}
                    title={`${movie.title} ${signedMoney(movie.net)}`}
                    onClick={() => onSelect(movie.id, "standings")}
                  >
                    {movie.posterUrl && width >= 12 && (
                      <img
                        src={movie.posterUrl}
                        alt=""
                        draggable={false}
                        loading="lazy"
                      />
                    )}
                    {width >= 18 && <span>{movie.title}</span>}
                  </button>
                );
              })}
            </motion.div>

            <p className={styles.meta}>
              {player.pending > 0
                ? `${player.movies.length - player.pending} of ${player.movies.length} scored`
                : `${player.movies.length} ${player.movies.length === 1 ? "movie" : "movies"}`}
            </p>
          </motion.li>
        ))}
      </ol>
      {inspector}
    </div>
  );
}

interface Segment {
  movie: FantasyMovie;
  from: number;
  to: number;
}

const stack = (movies: FantasyMovie[]) =>
  accumulate(movies.map((movie) => ({ movie, delta: movie.net })));

const scored = (movie: FantasyMovie) => movie.status === "scored";

const segmentsFor = ({ movies }: FantasyPlayer) => [
  ...stack(movies.filter((movie) => scored(movie) && movie.net > 0)),
  // Biggest loss first, so it sits next to the axis like the biggest gain.
  ...stack(movies.filter((movie) => scored(movie) && movie.net < 0).reverse()),
];
