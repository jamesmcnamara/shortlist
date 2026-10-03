"use client";

import { useRooms } from "@/app/lib/data/queries";
import { DataBoundary } from "@/app/lib/data/DataBoundary";
import { roomPath } from "@/lib/room-path";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./page.module.css";

/**
 * Lists every room the user belongs to. Anyone without one starts by
 * creating it, since a slug they cannot access would 404.
 */
export default function Rooms() {
  const { data: rooms, error, retry } = useRooms();
  if (rooms?.length === 0 && !error) redirect("/rooms/new");
  if (rooms?.length === 1 && !error) redirect(roomPath(rooms[0]));

  return (
    <DataBoundary pending={!rooms} error={error} retry={retry}>
      <main className={styles.shell}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Your rooms</h1>
            <Link className={styles.newRoom} href="/rooms/new">
              New room
            </Link>
          </div>

          <ul className={styles.list}>
            {rooms?.map((room) => (
              <li key={room.id}>
                <Link className={styles.roomCard} href={roomPath(room)} prefetch>
                  <span className={styles.roomDetails}>
                    <span className={styles.roomName}>{room.name}</span>
                  </span>
                  {room.posterUrls.length > 0 ? (
                    <span className={styles.posters} aria-hidden="true">
                      {room.posterUrls.map((posterUrl) => (
                        <img
                          className={styles.poster}
                          key={posterUrl}
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
