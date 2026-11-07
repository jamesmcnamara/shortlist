"use client";

import { formatMultiplier } from "@/app/lib/box-office-metrics";
import { buildLedger, signedMoney, type FantasyMovie } from "@/app/lib/fantasy";
import { heat } from "@/app/lib/heat";
import { scaleLinear } from "@visx/scale";
import { motion } from "motion/react";
import { Fragment, useState } from "react";
import styles from "./Fantasy.module.css";
import {
  EASE,
  firstName,
  isDimmed,
  Poster,
  toneStyle,
  useReveal,
  type ModuleProps,
} from "./shared";

const COLLAPSED = 8;

export function MovieLedger({
  players,
  selection,
  onSelect,
  inspector,
}: ModuleProps) {
  const { ref, show, reduced } = useReveal<HTMLOListElement>();
  const [expanded, setExpanded] = useState(false);

  const movies = buildLedger(players.flatMap(({ movies }) => movies));
  const visible = expanded ? movies : movies.slice(0, COLLAPSED);
  const ownerOf = (movie: FantasyMovie) =>
    players.find(({ id }) => id === movie.ownerId);

  // Same scale for every row, so bar lengths compare down the list.
  const nets = movies.map(({ net }) => net);
  const scale = scaleLinear({
    domain: [Math.min(0, ...nets) || -1, Math.max(0, ...nets) || 1],
    range: [0, 100],
  });
  const axis = scale(0);

  if (movies.length === 0) return null;

  return (
    <div className={styles.module}>
      <div className={styles.moduleHead}>
        <h3 className={styles.moduleTitle}>Every movie, ranked</h3>
      </div>

      <ol
        className={styles.ledger}
        ref={ref}
        aria-label={`Movies ranked by net`}
      >
        {visible.map((movie, index) => {
          const owner = ownerOf(movie);
          const left = scale(Math.min(0, movie.net));
          const width = scale(Math.max(0, movie.net)) - left;
          return (
            <Fragment key={movie.id}>
              <motion.li
                layout="position"
                transition={{ type: "spring", stiffness: 380, damping: 38 }}
              >
                <button
                  type="button"
                  className={styles.ledgerRow}
                  data-dim={isDimmed(movie, selection) || undefined}
                  aria-pressed={selection?.id === movie.id}
                  aria-label={`${movie.title}, ${signedMoney(movie.net)}`}
                  onClick={() => onSelect(movie.id, "ledger")}
                >
                  <span className={styles.rank}>{index + 1}</span>
                  <Poster movie={movie} className={styles.stepPoster} />
                  <span className={styles.ledgerMain}>
                    <span className={styles.stepTitle}>{movie.title}</span>
                    {owner && (
                      <span className={styles.stepWho}>
                        <i style={toneStyle(owner.tone)} />
                        {firstName(owner.name)}
                        {movie.multiplier !== null && (
                          <> &middot; {formatMultiplier(movie.multiplier)}</>
                        )}
                      </span>
                    )}
                  </span>
                  <span className={styles.miniTrack} aria-hidden>
                    <span
                      className={styles.axis}
                      style={{ left: `${axis}%` }}
                    />
                    <motion.span
                      className={styles.miniBar}
                      style={{
                        left: `${left}%`,
                        width: `max(0.1875rem, ${width}%)`,
                        background: heat(movie.score),
                        transformOrigin: movie.net < 0 ? "right" : "left",
                      }}
                      initial={reduced ? false : { scaleX: 0 }}
                      animate={{ scaleX: show ? 1 : 0 }}
                      transition={{
                        duration: 0.6,
                        ease: EASE,
                        delay: Math.min(index, COLLAPSED) * 0.04,
                      }}
                    />
                  </span>
                  <span
                    className={styles.chip}
                    style={{ background: heat(movie.score) }}
                  >
                    {signedMoney(movie.net)}
                  </span>
                </button>
              </motion.li>
              {selection?.id === movie.id && inspector && <li>{inspector}</li>}
            </Fragment>
          );
        })}
      </ol>

      {movies.length > COLLAPSED && (
        <button
          type="button"
          className={styles.pill}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show fewer" : `Show all ${movies.length}`}
        </button>
      )}
    </div>
  );
}
