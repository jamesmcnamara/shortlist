"use client";

import {
  buildLeadBreakdown,
  FantasyPlayer,
  signedMoney,
  type LeadStep,
} from "@/app/lib/fantasy";
import { heat } from "@/app/lib/heat";
import { scaleLinear } from "@visx/scale";
import { motion, type MotionProps } from "motion/react";
import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./Fantasy.module.css";
import {
  EASE,
  firstName,
  isDimmed,
  ModuleKey,
  Poster,
  toneStyle,
  useReveal,
  type ModuleProps,
  type Selection,
} from "./shared";

export function LeadBreakdown({
  players,
  selection,
  onSelect,
  inspector,
}: ModuleProps) {
  const { ref, show, reduced } = useReveal<HTMLOListElement>();
  const [leader, ...others] = players;
  const [opponentId, setOpponentId] = useState<string>();
  const opponent = others.find(({ id }) => id === opponentId) ?? others[0];
  const { lead, steps } = buildLeadBreakdown(leader, opponent);
  const byId = (id: string) => players.find((player) => player.id === id);

  const values = [0, lead, ...steps.flatMap(({ from, to }) => [from, to])];
  const scale = scaleLinear({
    domain: [Math.min(...values) || -1, Math.max(...values) || 1],
    range: [0, 100],
  });
  const axis = scale(0);

  const bar = (from: number, to: number, index: number, color?: string) => {
    const left = scale(Math.min(from, to));
    return {
      style: {
        left: `${left}%`,
        width: `max(0.1875rem, ${scale(Math.max(from, to)) - left}%)`,
        transformOrigin: to >= from ? "left" : "right",
        background: color,
      },
      initial: reduced ? false : { scaleX: 0 },
      animate: { scaleX: show ? 1 : 0 },
      transition: { duration: 0.6, ease: EASE, delay: index * 0.06 },
    } as const;
  };

  const title =
    lead === 0
      ? `${firstName(leader.name)} and ${firstName(opponent.name)}, movie by movie`
      : `Where ${firstName(leader.name)}\u2019s lead comes from`;

  return (
    <div className={styles.module}>
      <h3 className={styles.moduleTitle}>{title}</h3>
      <p className={styles.quiet}>
        A bar slides right when a movie helps {firstName(leader.name)} and left
        when it helps {firstName(opponent.name)}.
      </p>

      {others.length > 1 && (
        <div className={styles.pills} role="group" aria-label="Compare against">
          {others.map((player) => (
            <button
              key={player.id}
              type="button"
              className={styles.pill}
              aria-pressed={player.id === opponent.id}
              onClick={() => setOpponentId(player.id)}
            >
              vs {firstName(player.name)}
            </button>
          ))}
        </div>
      )}

      <ol className={styles.steps} ref={ref}>
        {steps.map((step, index) => (
          <Fragment key={step.kind === "movie" ? step.movie.id : "others"}>
            <li className={styles.step}>
              <StepRow
                step={step}
                selection={selection}
                owner={step.kind === "movie" ? byId(step.ownerId) : undefined}
                onSelect={onSelect}
              >
                <span className={styles.stepTrack}>
                  <span className={styles.axis} style={{ left: `${axis}%` }} />
                  <Bar
                    {...bar(step.from, step.to, index)}
                    color={
                      step.kind === "movie"
                        ? heat(step.movie.score)
                        : "var(--border-strong)"
                    }
                  />
                </span>
              </StepRow>
            </li>
            {step.kind === "movie" &&
              selection?.id === step.movie.id &&
              inspector && <li>{inspector}</li>}
          </Fragment>
        ))}
        <li className={styles.step} data-total>
          <div className={styles.stepRow}>
            <span className={styles.stepMain}>
              <strong className={styles.stepTitle}>
                {lead === 0 ? "Dead even" : "Lead"}
              </strong>
              <span className={styles.stepValue}>{signedMoney(lead)}</span>
            </span>
            <span className={styles.stepTrack}>
              <span className={styles.axis} style={{ left: `${axis}%` }} />
              <Bar {...bar(0, lead, steps.length)} total />
            </span>
          </div>
        </li>
      </ol>
    </div>
  );
}

export type BarProps = {
  style: CSSProperties;
  color?: string;
  total?: boolean;
} & Pick<MotionProps, "initial" | "animate" | "transition">;

function Bar({ style, color, total, ...motionProps }: BarProps) {
  return (
    <motion.span
      className={styles.stepBar}
      data-total={total || undefined}
      style={{ ...style, background: color }}
      {...motionProps}
    />
  );
}

interface StepRowProps {
  step: LeadStep;
  selection?: Selection;
  owner?: FantasyPlayer;
  onSelect(id: number, source: ModuleKey): void;
  children: ReactNode;
}

function StepRow({ step, selection, owner, onSelect, children }: StepRowProps) {
  if (step.kind === "others") {
    return (
      <div className={styles.stepRow}>
        <span className={styles.stepMain}>
          <span className={styles.stepTitle}>{step.count} smaller movies</span>
          <span className={styles.stepValue}>{signedMoney(step.delta)}</span>
        </span>
        {children}
      </div>
    );
  }

  const { movie, delta } = step;
  return (
    <button
      type="button"
      className={styles.stepRow}
      data-dim={isDimmed(movie, selection) || undefined}
      aria-pressed={selection?.id === movie.id}
      aria-label={`${movie.title}, ${signedMoney(delta)} to the lead`}
      onClick={() => onSelect(movie.id, "lead")}
    >
      <Poster movie={movie} className={styles.stepPoster} />
      <span className={styles.stepMain}>
        <span className={styles.stepTitle}>{movie.title}</span>
        {owner && (
          <span className={styles.stepWho}>
            <i style={toneStyle(owner.tone)} />
            {firstName(owner.name)}
          </span>
        )}
        <span className={styles.stepValue}>{signedMoney(delta)}</span>
      </span>
      {children}
    </button>
  );
}
