"use client";

import { useRoom } from "@/app/[ownerId]/[slug]/RoomContext";
import { AppMenu } from "./AppMenu";
import styles from "./ShortlistHeader.module.css";
import Link from "next/link";

export function ShortlistHeader() {
  const { room, rooms, isAdmin } = useRoom();

  return (
    <header className={styles.header}>
      <span className={styles.roomName}>
        <Link href="/">Shortlist</Link>
      </span>
      <AppMenu
        room={{
          slug: room.slug,
          ownerId: room.ownerId,
          isAdmin,
        }}
        showMyRooms={rooms.length > 1}
      />
    </header>
  );
}
