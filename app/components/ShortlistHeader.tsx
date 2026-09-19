"use client";

import { useRoom } from "@/app/r/[slug]/RoomContext";
import { getRoomType } from "../lib/rooms";
import { AppMenu } from "./AppMenu";
import styles from "./ShortlistHeader.module.css";
import Link from "next/link";

type ShortlistHeaderProps = {
  votesLeft: number;
};

export function ShortlistHeader({ votesLeft }: ShortlistHeaderProps) {
  const { room, rooms, isAdmin } = useRoom();
  const isMovieClub = getRoomType(room) === "club";

  return (
    <header className={styles.header}>
      <span className={styles.roomName}>
        <Link href="/">{isMovieClub ? room.name : "Shortlist"}</Link>
      </span>
      {isMovieClub && (
        <div className={styles.balances}>
          <span id="tour-votes" className={styles.voteBalance}>
            {votesLeft} {votesLeft === 1 ? "vote" : "votes"} left
          </span>
        </div>
      )}
      <AppMenu
        room={{ slug: room.slug, isAdmin }}
        showMyRooms={rooms.length > 1}
      />
    </header>
  );
}
