"use client";

import { useTheatre } from "@/app/theatres/[theatreId]/TheatreContext";
import { AppMenu } from "./AppMenu";
import styles from "./ShortlistHeader.module.css";
import Link from "next/link";

export function ShortlistHeader() {
  const { theatre, theatres } = useTheatre();

  return (
    <header className={styles.header}>
      <span className={styles.theatreName}>
        <Link href="/">Shortlist</Link>
      </span>
      <AppMenu
        theatre={{ id: theatre.id }}
        showMyTheatres={theatres.length > 1}
      />
    </header>
  );
}
