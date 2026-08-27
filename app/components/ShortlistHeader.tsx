"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useRoom } from "@/app/r/[slug]/RoomContext";
import styles from "./ShortlistHeader.module.css";

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

  return (
    <header className={styles.header}>
      <span className={styles.roomName}>{room.name}</span>
      <div className={styles.balances}>
        <span className={styles.voteBalance}>
          {votesLeft} {votesLeft === 1 ? "vote" : "votes"} left
        </span>
      </div>
      {name ? (
        <div className={styles.menu} ref={menuRef}>
          <button
            className={styles.menuButton}
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
              {rooms.length > 1 &&
                rooms
                  .filter((option) => option.slug !== room.slug)
                  .map((option) => (
                    <Link
                      key={option.id}
                      className={styles.menuItem}
                      href={`/r/${option.slug}`}
                      role="menuitem"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Switch to {option.name}
                    </Link>
                  ))}
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

function FilmReelIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="6.5" r="1.75" fill="currentColor" />
      <circle cx="17" cy="9.5" r="1.75" fill="currentColor" />
      <circle cx="15.25" cy="15.75" r="1.75" fill="currentColor" />
      <circle cx="8.75" cy="15.75" r="1.75" fill="currentColor" />
      <circle cx="7" cy="9.5" r="1.75" fill="currentColor" />
    </svg>
  );
}
