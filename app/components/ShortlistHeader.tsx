"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useRoom } from "@/app/r/[slug]/RoomContext";
import styles from "./ShortlistHeader.module.css";
import { getRoomType } from "../lib/rooms";
import { FilmReelIcon } from "./FilmReelIcon";

type ShortlistHeaderProps = {
  votesLeft: number;
};

export function ShortlistHeader({ votesLeft }: ShortlistHeaderProps) {
  const { data: session } = authClient.useSession();
  const { room, rooms, isAdmin } = useRoom();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const name = session?.user?.name || session?.user?.email || "";

  useEffect(() => {
    if (!isMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isMenuOpen]);

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

  const isMovieClub = getRoomType(room) === "club";

  console.log(session);
  return (
    <header className={styles.header}>
      <span className={styles.roomName}>
        {isMovieClub ? room.name : "Shortlist"}
      </span>
      {isMovieClub && (
        <div className={styles.balances}>
          <span id="tour-votes" className={styles.voteBalance}>
            {votesLeft} {votesLeft === 1 ? "vote" : "votes"} left
          </span>
        </div>
      )}
      {name ? (
        <div className={styles.menu} ref={menuRef}>
          <button
            className={styles.menuButton}
            id="tour-menu"
            type="button"
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label="Menu"
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            <FilmReelIcon />
          </button>
          {isMenuOpen && (
            <div className={styles.menuPanel} role="menu">
              {rooms.length > 1 && (
                <Link
                  className={styles.menuItem}
                  href="/"
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                >
                  My rooms
                </Link>
              )}
              <Link
                className={styles.menuItem}
                href={`/r/${room.slug}/search`}
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
              >
                Search
              </Link>
              <Link
                className={styles.menuItem}
                href="/rooms/new"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
              >
                New room
              </Link>
              {isAdmin && (
                <Link
                  className={styles.menuItem}
                  href={`/r/${room.slug}/settings`}
                  role="menuitem"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Settings
                </Link>
              )}
              <Link
                className={styles.menuItem}
                href="/feedback"
                role="menuitem"
                onClick={() => setIsMenuOpen(false)}
              >
                Feedback
              </Link>
              <button
                className={styles.menuItem}
                type="button"
                role="menuitem"
                disabled={isSigningOut}
                onClick={handleSignOut}
              >
                {isSigningOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
