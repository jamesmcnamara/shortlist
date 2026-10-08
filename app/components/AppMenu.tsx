"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { useClickOutside } from "@/app/lib/useClickOutside";
import { FilmReelIcon } from "./FilmReelIcon";
import { roomPath } from "@/lib/room-path";
import styles from "./AppMenu.module.css";

interface AppMenuProps {
  /** Omitted outside a room, which hides the room-scoped items. */
  room?: { slug: string; ownerId: string; isAdmin: boolean };
  showMyRooms?: boolean;
  onBulkJustWatch?: () => void;
  isUpdatingJustWatch?: boolean;
}

/** The account and navigation menu, shared by every header. */
export function AppMenu({
  room,
  showMyRooms = true,
  onBulkJustWatch,
  isUpdatingJustWatch = false,
}: AppMenuProps) {
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(
    () => setIsOpen(false),
    isOpen,
  );
  const router = useRouter();
  const name = session?.user?.name || session?.user?.email || "";

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
            <MenuLink href={`${roomPath(room)}/settings`} onNavigate={close}>
              Settings
            </MenuLink>
          )}
          <MenuLink href="/compare" onNavigate={close}>
            Compare
          </MenuLink>
          <MenuButton onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? "Collapse" : "Extra Settings"}
          </MenuButton>
          <hr className={styles.divider} />
          {isExpanded && (
            <>
              {room && onBulkJustWatch && (
                <button
                  className={styles.menuItem}
                  type="button"
                  role="menuitem"
                  disabled={isUpdatingJustWatch}
                  onClick={() => {
                    close();
                    onBulkJustWatch();
                  }}
                >
                  {isUpdatingJustWatch
                    ? "Updating JustWatch..."
                    : "Bulk JustWatch"}
                </button>
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
            </>
          )}
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
      prefetch
      role="menuitem"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

interface MenuButtonProps {
  onClick(): void;
  children: React.ReactNode;
}

function MenuButton({ onClick, children }: MenuButtonProps) {
  return (
    <button className={styles.menuItem} type="button" onClick={onClick}>
      {children}
    </button>
  );
}
