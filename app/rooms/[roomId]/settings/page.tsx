"use client";

import Link from "next/link";
import { roomPath } from "@/lib/room-path";
import { useRoom } from "../RoomContext";
import { AdminSettings } from "./AdminSettings";
import { NotificationSettings } from "./NotificationSettings";
import styles from "./page.module.css";

export default function RoomSettingsPage() {
  const { room, isAdmin } = useRoom();

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{room.name}</h1>
          <p className={styles.subtitle}>Room settings</p>
        </div>
        <Link className={styles.back} href={roomPath(room)}>
          Back to the list
        </Link>
      </header>

      {isAdmin && <AdminSettings />}
      <NotificationSettings key={room.id} roomId={room.id} />
    </main>
  );
}
