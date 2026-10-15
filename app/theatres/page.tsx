"use client";

import { useTheatres } from "@/app/lib/data/queries";
import { DataBoundary } from "@/app/lib/data/DataBoundary";
import { theatrePath } from "@/lib/theatre-path";
import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import styles from "./page.module.css";

/**
 * Lists every theatre the user belongs to. Anyone without one starts by
 * creating it, since a theatre they cannot access would 404.
 */
export default function Theatres() {
  const { data: theatres, error, retry } = useTheatres();
  if (theatres?.length === 0 && !error) redirect("/theatres/new");
  if (theatres?.length === 1 && !error) redirect(theatrePath(theatres[0]));

  return (
    <DataBoundary pending={!theatres} error={error} retry={retry}>
      <main className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Theatres Near You</h1>
            <Link className={styles.newTheatre} href="/theatres/new">
              New theatre
            </Link>
          </div>

          <ul className={styles.list}>
            {theatres?.map((theatre) => (
              <li key={theatre.id}>
                <Link className={styles.theatreCard} href={theatrePath(theatre)} prefetch>
                  <span className={styles.theatreDetails}>
                    <span className={styles.theatreName}>{theatre.name}</span>
                  </span>
                  {theatre.posterUrls.length > 0 ? (
                    <span className={styles.posters} aria-hidden="true">
                      {theatre.posterUrls.map((posterUrl, i) => (
                        <img
                          className={styles.poster}
                          key={posterUrl}
                          style={{ "--i": i } as CSSProperties}
                          src={posterUrl}
                          alt=""
                          width="48"
                          height="72"
                          loading="lazy"
                        />
                      ))}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </DataBoundary>
  );
}
