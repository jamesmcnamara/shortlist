"use client";

import Link from "next/link";
import { theatrePath } from "@/lib/theatre-path";
import { useTheatre } from "../TheatreContext";
import { AdminSettings } from "./AdminSettings";
import { NotificationSettings } from "./NotificationSettings";
import styles from "./page.module.css";

export default function TheatreSettingsPage() {
  const { theatre, isAdmin } = useTheatre();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{theatre.name}</h1>
          <p className={styles.subtitle}>Theatre settings</p>
        </div>
        <Link className={styles.back} href={theatrePath(theatre)}>
          Back to the list
        </Link>
      </header>

      {isAdmin && <AdminSettings />}
      <NotificationSettings key={theatre.id} theatreId={theatre.id} />
    </main>
  );
}
