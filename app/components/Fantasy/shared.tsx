"use client";

import { BoxOffice } from "@/app/components/BoxOffice";
import { CloseIcon } from "@/app/components/CloseIcon";
import {
  signedMoney,
  type FantasyMovie,
  type FantasyPlayer,
} from "@/app/lib/fantasy";
import { heat } from "@/app/lib/heat";
import { getInitials } from "@/app/lib/utils";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./Fantasy.module.css";

export const EASE = [0.16, 1, 0.3, 1] as const;

export type ModuleKey = "standings" | "lead" | "race" | "ledger";

export interface Selection {
  id: number;
  source: ModuleKey;
}

export interface ModuleProps {
  players: FantasyPlayer[];
  selection?: Selection;
  onSelect(id: number, source: ModuleKey): void;
  /** Only set on the module the selection was made in. */
  inspector: ReactNode;
}

/** True once scrolled into view. Reduced motion skips straight to the end. */
export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const reduced = !!useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.2 });
  return { ref, show: reduced || inView, reduced };
}

export const toneStyle = (tone: number) =>
  ({ "--tone": `var(--tone-${tone % 5})` }) as CSSProperties;

export const isDimmed = (movie: FantasyMovie, selection?: Selection) =>
  selection && selection.id !== movie.id;

export const firstName = (name: string) => name.split(" ")[0] || name;

export function CountUp({ value, play }: { value: number; play: boolean }) {
  const reduced = !!useReducedMotion();
  const amount = useMotionValue(reduced ? value : 0);
  const text = useTransform(amount, signedMoney);

  useEffect(() => {
    if (reduced) {
      amount.set(value);
      return;
    }
    if (!play) return;
    const controls = animate(amount, value, { duration: 0.9, ease: EASE });
    return () => controls.stop();
  }, [amount, play, reduced, value]);

  return <motion.span>{text}</motion.span>;
}

export function NetChip({
  net,
  score,
  play,
}: {
  net: number;
  score: number;
  play: boolean;
}) {
  return (
    <span className={styles.chip} style={{ background: heat(score) }}>
      <CountUp value={net} play={play} />
    </span>
  );
}

export function Avatar({ player }: { player: FantasyPlayer }) {
  return (
    <span className={styles.avatar} style={toneStyle(player.tone)} aria-hidden>
      {getInitials(player.name)}
    </span>
  );
}

interface PosterProps {
  movie: FantasyMovie;
  className?: string;
}

export function Poster({ movie, className }: PosterProps) {
  return (
    <span className={`${styles.poster} ${className ?? ""}`} aria-hidden>
      {movie.posterUrl ? (
        <img src={movie.posterUrl} alt="" draggable={false} loading="lazy" />
      ) : (
        movie.title.slice(0, 1)
      )}
    </span>
  );
}

export interface MovieInspectorProps {
  movie: FantasyMovie;
  owner?: FantasyPlayer;
  onOpen(): void;
  onClear(): void;
}

export function MovieInspector({
  movie,
  owner,
  onOpen,
  onClear,
}: MovieInspectorProps) {
  return (
    <motion.div
      className={styles.inspector}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      role="group"
      aria-label={`${movie.title} details`}
    >
      {owner && (
        <p className={styles.inspectorTitle}>
          <span>{firstName(owner.name)}&rsquo;s pick</span>
        </p>
      )}
      {movie.status === "scored" ? (
        <BoxOffice data={movie.boxOffice} />
      ) : (
        <p className={styles.quiet}>
          {movie.status === "unreleased"
            ? "Not out yet, so nothing counts."
            : "No box office numbers yet, so it counts as $0."}
        </p>
      )}
      <div className={styles.inspectorActions}>
        <button type="button" className={styles.pill} onClick={onOpen}>
          Open
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClear}
          aria-label="Clear selection"
        >
          <CloseIcon />
        </button>
      </div>
    </motion.div>
  );
}
