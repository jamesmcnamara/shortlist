"use client";

import { signedMoney, type Race, type RacePoint } from "@/app/lib/fantasy";
import { compactMoney } from "@/app/lib/box-office-metrics";
import { heat } from "@/app/lib/heat";
import { curveStepAfter } from "@visx/curve";
import { scaleLinear, scaleUtc } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { sortBy, truncate } from "lodash";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import styles from "./Fantasy.module.css";
import {
  EASE,
  firstName,
  toneStyle,
  useReveal,
  type ModuleProps,
} from "./shared";

const DAY_MS = 86_400_000;
const MARGIN = { top: 22, right: 92, bottom: 26, left: 44 };
const LABEL_GAP = 28;

type Step = { time: number; value: number };

function useElementWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/** Pushes labels apart top to bottom so none overlap. */
const spreadLabels = (ys: number[]) =>
  sortBy(
    ys.map((y, index) => ({ y, index })),
    "y",
  )
    .reduce<{ y: number; index: number }[]>(
      (placed, { y, index }) => [
        ...placed,
        { index, y: Math.max(y, (placed.at(-1)?.y ?? -Infinity) + LABEL_GAP) },
      ],
      [],
    )
    .reduce<number[]>((byIndex, { y, index }) => {
      byIndex[index] = y;
      return byIndex;
    }, []);

const formatDay = (time: number, longSpan: boolean) =>
  new Date(time).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    ...(longSpan ? { year: "2-digit" } : { day: "numeric" }),
  });

const onActivate = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

export function SeasonRace({
  race,
  selection,
  onSelect,
  inspector,
}: Pick<ModuleProps, "selection" | "onSelect" | "inspector"> & {
  race: Race;
}) {
  const { ref: boxRef, width } = useElementWidth<HTMLDivElement>();
  const { ref: revealRef, show, reduced } = useReveal<HTMLDivElement>();

  const height = width > 0 && width < 520 ? 240 : 300;
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const { series, start, today } = race;
  const end = Math.max(race.end, start + DAY_MS);
  const finals = series.map(({ points }) => points.at(-1)?.cumulative ?? 0);
  const values = [
    0,
    ...series.flatMap(({ points }) =>
      points.map(({ cumulative }) => cumulative),
    ),
  ];

  const x = scaleUtc({ domain: [start, end], range: [0, innerWidth] });
  const y = scaleLinear({
    domain: [Math.min(...values) || -1, Math.max(...values) || 1],
    range: [innerHeight, 0],
    nice: true,
  });
  const todayX = Math.min(Math.max(today, start), end);
  const labelYs = spreadLabels(finals.map((value) => y(value)));
  const longSpan = end - start >= 365 * DAY_MS;

  const lines = series.map(({ player, points }) => {
    const past = points.filter(({ future }) => !future);
    const ahead = points.filter(({ future }) => future);
    const now = past.at(-1)?.cumulative ?? 0;
    const asStep = ({ time, cumulative }: RacePoint): Step => ({
      time,
      value: cumulative,
    });
    return {
      player,
      points,
      solid: [
        { time: start, value: 0 },
        ...past.map(asStep),
        { time: todayX, value: now },
      ],
      dashed:
        todayX < end
          ? [
              { time: todayX, value: now },
              ...ahead.map(asStep),
              { time: end, value: ahead.at(-1)?.cumulative ?? now },
            ]
          : [],
    };
  });

  const path = (
    data: Step[],
    className: string,
    delay: number,
    dashed?: boolean,
  ) => (
    <LinePath<Step>
      data={data}
      x={(d) => x(d.time)}
      y={(d) => y(d.value)}
      curve={curveStepAfter}
    >
      {({ path: line }) => (
        <motion.path
          d={line(data) ?? ""}
          className={className}
          fill="none"
          initial={
            reduced ? false : dashed ? { opacity: 0 } : { pathLength: 0 }
          }
          animate={
            dashed ? { opacity: show ? 1 : 0 } : { pathLength: show ? 1 : 0 }
          }
          transition={{
            duration: dashed ? 0.4 : 1.1,
            ease: EASE,
            delay: dashed ? delay + 1 : delay,
          }}
        />
      )}
    </LinePath>
  );

  return (
    <div className={styles.module}>
      <h3 className={styles.moduleTitle}>The race so far</h3>
      <p className={styles.quiet}>
        Each dot is a release, colored by how it did. Dashed means it
        hasn&rsquo;t happened yet.
      </p>

      <div ref={boxRef} className={styles.race}>
        <div ref={revealRef}>
          {width > 0 && (
            <svg
              width={width}
              height={height}
              className={styles.raceSvg}
              role="group"
              aria-label="Cumulative net by release date for each player"
            >
              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {y.ticks(4).map((tick) => (
                  <g key={tick} transform={`translate(0,${y(tick)})`}>
                    <line
                      x2={innerWidth}
                      className={tick === 0 ? styles.zeroLine : styles.gridLine}
                    />
                    <text
                      x={-10}
                      dy="0.32em"
                      textAnchor="end"
                      className={styles.tickText}
                    >
                      {compactMoney(tick)}
                    </text>
                  </g>
                ))}

                {x
                  .ticks(Math.max(2, Math.floor(innerWidth / 96)))
                  .map((tick) => (
                    <text
                      key={tick.getTime()}
                      x={x(tick)}
                      y={innerHeight + 18}
                      textAnchor="middle"
                      className={styles.tickText}
                    >
                      {formatDay(tick.getTime(), longSpan)}
                    </text>
                  ))}

                {today >= start && today <= end && (
                  <g transform={`translate(${x(todayX)},0)`}>
                    <line
                      y1={-6}
                      y2={innerHeight}
                      className={styles.todayLine}
                    />
                    <text
                      y={-10}
                      textAnchor={
                        x(todayX) > innerWidth - 24 ? "end" : "middle"
                      }
                      className={styles.tickText}
                    >
                      Today
                    </text>
                  </g>
                )}

                {lines.map(({ player, solid, dashed }, index) => (
                  <g
                    key={player.id}
                    className={styles.series}
                    style={toneStyle(player.tone)}
                  >
                    {path(solid, styles.line, index * 0.12)}
                    {path(dashed, styles.lineAhead, index * 0.12, true)}
                  </g>
                ))}

                {lines.flatMap(({ player, points }) =>
                  points.map((point, index) => {
                    const { movie, known, cumulative } = point;
                    const selected = selection?.id === movie.id;
                    const select = () => onSelect(movie.id, "race");
                    const delay = reduced
                      ? 0
                      : 0.2 + (x(point.time) / (innerWidth || 1)) * 0.9;
                    return (
                      <g
                        key={`${player.id}-${movie.id}`}
                        transform={`translate(${x(point.time)},${y(cumulative)})`}
                        className={styles.dot}
                        style={toneStyle(player.tone)}
                        data-dim={
                          (selection !== null && !selected) || undefined
                        }
                        data-selected={selected || undefined}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        aria-label={`${movie.title}, ${known ? signedMoney(movie.net) : "no numbers yet"}. ${firstName(player.name)} total ${signedMoney(cumulative)}`}
                        onClick={select}
                        onKeyDown={onActivate(select)}
                      >
                        <circle r={16} className={styles.dotHit} />
                        <circle r={10} className={styles.dotFocus} />
                        <motion.circle
                          r={6}
                          className={
                            known ? styles.dotMark : styles.dotMarkOpen
                          }
                          style={{
                            fill: known ? heat(movie.score) : undefined,
                            transformBox: "fill-box",
                            transformOrigin: "center",
                          }}
                          initial={reduced ? false : { scale: 0 }}
                          animate={{ scale: show ? 1 : 0 }}
                          transition={{
                            duration: 0.35,
                            ease: EASE,
                            delay: delay + index * 0.02,
                          }}
                        />
                      </g>
                    );
                  }),
                )}

                {lines.map(({ player }, index) => (
                  <text
                    key={player.id}
                    y={labelYs[index]}
                    className={styles.endLabel}
                    style={toneStyle(player.tone)}
                  >
                    <tspan x={innerWidth + 10} dy="-0.25em">
                      {truncate(firstName(player.name), {
                        length: 12,
                        omission: "\u2026",
                      })}
                    </tspan>
                    <tspan
                      x={innerWidth + 10}
                      dy="1.2em"
                      className={styles.endValue}
                    >
                      {signedMoney(finals[index])}
                    </tspan>
                  </text>
                ))}
              </g>
            </svg>
          )}
        </div>
      </div>
      {inspector}
    </div>
  );
}
