"use client";

import type { Nomination } from "@/src/db/schema";
import { buildRace, buildStandings, signedMoney } from "@/app/lib/fantasy";
import { heat } from "@/app/lib/heat";
import { useEffect, useMemo, useState } from "react";
import styles from "./Fantasy.module.css";
import { LeadBreakdown } from "./LeadBreakdown";
import { MovieLedger } from "./MovieLedger";
import { SeasonRace } from "./SeasonRace";
import { Standings } from "./Standings";
import { StillToCome } from "./StillToCome";
import {
  firstName,
  MovieInspector,
  type ModuleKey,
  type Selection,
} from "./shared";

export interface FantasyDashboardProps {
  nominees: Nomination[];
  onOpen(id: number): void;
}

export function FantasyDashboard({ nominees, onOpen }: FantasyDashboardProps) {
  const standings = useMemo(() => buildStandings(nominees), [nominees]);
  const { players, movies, today, asOf } = standings;
  const [selection, setSelection] = useState<Selection | undefined>(undefined);

  useEffect(() => {
    if (!selection) return;
    const onKey = (event: KeyboardEvent) =>
      event.key === "Escape" && setSelection(undefined);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection]);

  const select = (id: number, source: ModuleKey) =>
    setSelection((current) =>
      current?.id === id && current.source === source
        ? undefined
        : { id, source },
    );

  const selected = movies.find(({ id }) => id === selection?.id);
  const inspectorFor = (source: ModuleKey) =>
    selected && selection?.source === source ? (
      <MovieInspector
        movie={selected}
        owner={players.find(({ id }) => id === selected.ownerId)}
        onOpen={() => onOpen(selected.id)}
        onClear={() => setSelection(undefined)}
      />
    ) : null;

  const hasScores = movies.some(({ status }) => status === "scored");
  const race = useMemo(() => buildRace(standings), [standings]);
  const racePoints = race.series.flatMap(({ points }) => points).length;

  const moduleProps = (source: ModuleKey) => ({
    players,
    selection,
    onSelect: select,
    inspector: inspectorFor(source),
  });

  const [leader, second] = players;
  const tied = players.filter(({ rank }) => rank === 1);

  const lead = !hasScores ? (
    <>Nothing has numbers yet. Standings fill in as movies open.</>
  ) : !second ? (
    <>
      <strong>{firstName(leader.name)}</strong> is at{" "}
      <span className={styles.chip} style={{ background: heat(leader.score) }}>
        {signedMoney(leader.net)}
      </span>{" "}
      so far.
    </>
  ) : tied.length > 1 ? (
    <>
      <strong>{list(tied.map(({ name }) => firstName(name)))}</strong> are tied
      at{" "}
      <span className={styles.chip} style={{ background: heat(leader.score) }}>
        {signedMoney(leader.net)}
      </span>
      .
    </>
  ) : (
    <>
      <strong>{firstName(leader.name)}</strong> leads{" "}
      <strong>{firstName(second.name)}</strong> by{" "}
      <span className={styles.chip} style={{ background: heat(leader.score) }}>
        {signedMoney(leader.net - second.net)}
      </span>
    </>
  );

  return (
    <section className={styles.dashboard} aria-labelledby="fantasy-title">
      <header className={styles.header}>
        <h2 id="fantasy-title" className={styles.title}>
          Standings
        </h2>
        <p className={styles.lead}>{lead}</p>
      </header>

      {players.length === 0 ? (
        <p className={styles.quiet}>
          No movies yet. Once people add some, the standings show up here.
        </p>
      ) : (
        <>
          <Standings {...moduleProps("standings")} />
          <p className={styles.caption}>
            Net is worldwide gross minus budget
            {asOf ? `, as of ${dateLabel(asOf)}` : ""}.
          </p>

          {hasScores && second && <LeadBreakdown {...moduleProps("lead")} />}
          {hasScores && racePoints >= 2 && (
            <SeasonRace
              race={race}
              selection={selection}
              onSelect={select}
              inspector={inspectorFor("race")}
            />
          )}
          {hasScores && <MovieLedger {...moduleProps("ledger")} />}
          <StillToCome players={players} today={today} onOpen={onOpen} />
        </>
      )}
    </section>
  );
}

const list = (names: string[]) =>
  new Intl.ListFormat("en", { type: "conjunction" }).format(names);

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
