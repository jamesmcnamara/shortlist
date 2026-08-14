"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { withTargetValue } from "@/app/lib/utils";
import { useRoom } from "@/app/r/[slug]/RoomContext";
import styles from "./ShortlistHeader.module.css";

/** Sentinel value for the switcher's "create a room" entry. */
const NEW_ROOM = "__new__";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ShortlistHeaderProps = {
  votesLeft: number;
  /** null when the room does not cap nominations. */
  nominationsLeft?: number | null;
};

export function ShortlistHeader({
  votesLeft,
  nominationsLeft,
}: ShortlistHeaderProps) {
  const { data: session } = authClient.useSession();
  const { room, rooms, isAdmin } = useRoom();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();
  const name = session?.user?.name || session?.user?.email || "";

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/auth/sign-in");
      router.refresh();
    } catch {
      setIsSigningOut(false);
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span>Shortlist</span>
        {rooms.length > 1 ? (
          <select
            className={styles.roomSwitcher}
            aria-label="Switch room"
            value={room.slug}
            onChange={withTargetValue((slug) =>
              router.push(slug === NEW_ROOM ? "/rooms/new" : `/r/${slug}`),
            )}
          >
            {rooms.map((option) => (
              <option key={option.id} value={option.slug}>
                {option.name}
              </option>
            ))}
            <option value={NEW_ROOM}>+ New room…</option>
          </select>
        ) : (
          <>
            <span className={styles.roomName}>{room.name}</span>
            <Link className={styles.newRoom} href="/rooms/new">
              + New room
            </Link>
          </>
        )}
      </div>
      {name ? (
        <div className={styles.profile}>
          {typeof nominationsLeft === "number" && (
            <span className={styles.voteBalance}>
              {nominationsLeft}{" "}
              {nominationsLeft === 1 ? "nomination" : "nominations"} left
            </span>
          )}
          <span className={styles.voteBalance}>
            {votesLeft} {votesLeft === 1 ? "vote" : "votes"} left
          </span>
          <div className={styles.identity}>
            <span className="avatar avatar-violet">{initialsFor(name)}</span>
            <span className={styles.name}>{name}</span>
          </div>
          {isAdmin && (
            <Link className={styles.signOut} href={`/r/${room.slug}/settings`}>
              Settings
            </Link>
          )}
          <button
            className={styles.signOut}
            type="button"
            disabled={isSigningOut}
            onClick={handleSignOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </header>
  );
}
