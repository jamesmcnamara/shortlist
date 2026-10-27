"use client";

import Link from "next/link";
import { theatrePath } from "@/lib/theatre-path";
import { useTheatre } from "../TheatreContext";
import { AdminSettings } from "./AdminSettings";
import { NotificationSettings } from "./NotificationSettings";
import styles from "./page.module.css";

export default function TheatreSettingsPage() {
  const { theatre, role, isAdmin } = useTheatre();

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

      {!role && (
        <p className={styles.subtitle} role="alert">
          You need a list invitation to open its settings.
        </p>
      )}
      {isAdmin && <AdminSettings />}
      {role && <NotificationSettings key={theatre.id} theatreId={theatre.id} />}
    </main>
  );
}
