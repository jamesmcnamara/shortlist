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
        <span id="tour-votes" className={styles.voteBalance}>
          {votesLeft} {votesLeft === 1 ? "vote" : "votes"} left
        </span>
      </div>
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
      fill="#000000"
      height="20"
      width="20"
      version="1.1"
      id="Capa_1"
      viewBox="0 0 360 360"
      xmlSpace="preserve"
    >
      <path
        id="XMLID_16_"
        d="M205,25C119.533,25,50,94.533,50,180c0,40.473,15.599,77.365,41.092,105H0v50h210v-0.089
	c83.162-2.65,150-71.117,150-154.911C360,94.533,290.467,25,205,25z M116.731,217.83c-20.893,0-37.83-16.937-37.83-37.83
	s16.937-37.83,37.83-37.83s37.83,16.937,37.83,37.83S137.624,217.83,116.731,217.83z M205,306.099
	c-20.893,0-37.83-16.937-37.83-37.83s16.937-37.83,37.83-37.83s37.83,16.937,37.83,37.83S225.893,306.099,205,306.099z M205,129.56
	c-20.893,0-37.83-16.937-37.83-37.83c0-20.893,16.937-37.83,37.83-37.83s37.83,16.937,37.83,37.83
	C242.83,112.623,225.893,129.56,205,129.56z M293.269,217.83c-20.893,0-37.83-16.937-37.83-37.83s16.937-37.83,37.83-37.83
	s37.83,16.937,37.83,37.83S314.162,217.83,293.269,217.83z"
      />
    </svg>
  );
}
