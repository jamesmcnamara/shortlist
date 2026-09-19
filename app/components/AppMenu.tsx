"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { FilmReelIcon } from "./FilmReelIcon";
import styles from "./AppMenu.module.css";

interface AppMenuProps {
  /** Omitted outside a room, which hides the room-scoped items. */
  room?: { slug: string; isAdmin: boolean };
  showMyRooms?: boolean;
}

/** The account and navigation menu, shared by every header. */
export function AppMenu({ room, showMyRooms = true }: AppMenuProps) {
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const name = session?.user?.name || session?.user?.email || "";

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  async function signOut() {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/auth/sign-in");
    } catch {
      setIsSigningOut(false);
    }
  }

  if (!name) return null;

  const close = () => setIsOpen(false);

  return (
    <div className={styles.menu} ref={menuRef}>
      <button
        className={styles.menuButton}
        id="tour-menu"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <FilmReelIcon />
      </button>
      {isOpen && (
        <div className={styles.menuPanel} role="menu">
          {showMyRooms && (
            <MenuLink href="/rooms" onNavigate={close}>
              My rooms
            </MenuLink>
          )}
          <MenuLink href="/rooms/new" onNavigate={close}>
            New room
          </MenuLink>
          {room?.isAdmin && (
            <MenuLink href={`/r/${room.slug}/settings`} onNavigate={close}>
              Settings
            </MenuLink>
          )}
          <MenuLink href="/feedback" onNavigate={close}>
            Feedback
          </MenuLink>
          <button
            className={styles.menuItem}
            type="button"
            role="menuitem"
            disabled={isSigningOut}
            onClick={signOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

interface MenuLinkProps {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}

function MenuLink({ href, onNavigate, children }: MenuLinkProps) {
  return (
    <Link
      className={styles.menuItem}
      href={href}
      role="menuitem"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
