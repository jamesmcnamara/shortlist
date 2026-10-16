"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { useClickOutside } from "@/app/lib/useClickOutside";
import { FilmReelIcon } from "./FilmReelIcon";
import { joinPath, theatrePath } from "@/lib/theatre-path";
import { useTheatres } from "@/app/lib/data/queries";
import { disconnectDeviceNotifications } from "@/app/lib/push";
import styles from "./AppMenu.module.css";
import { BulkBoxOfficeRefresh } from "./BulkBoxOfficeRefresh";

export interface AppMenuProps {
  /** Omitted outside a theatre, which hides the theatre-scoped items. */
  theatre?: { id: string; inviteCode?: string };
  showMyTheatres?: boolean;
}

/** The account and navigation menu, shared by every header. */
export function AppMenu({ theatre, showMyTheatres = true }: AppMenuProps) {
  const { data: session } = authClient.useSession();
  const { data: theatres } = useTheatres();
  const watchlist = theatres?.find(
    (candidate) => candidate.watchlistFor === session?.user.id,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const menuRef = useClickOutside<HTMLDivElement>(
    () => setIsOpen(false),
    isOpen,
  );
  const router = useRouter();
  const name = session?.user?.name || session?.user?.email || "";
  const inviteCode = theatre?.inviteCode;

  async function signOut() {
    setIsSigningOut(true);
    setSignOutError("");
    try {
      await disconnectDeviceNotifications();
      await authClient.signOut();
      router.replace("/auth/sign-in");
    } catch {
      setSignOutError(
        "Unable to sign out safely. Check your connection and try again.",
      );
      setIsSigningOut(false);
    }
  }

  async function copyShareLink(inviteCode: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${joinPath(inviteCode)}`,
      );
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
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
        onClick={() => {
          setIsOpen((open) => !open);
          setShareStatus("idle");
        }}
      >
        <FilmReelIcon />
      </button>
      <div className={styles.menuPanel} role="menu" hidden={!isOpen}>
        {signOutError && (
          <p className={styles.error} role="alert">
            {signOutError}
          </p>
        )}
        {watchlist && (
          <MenuLink href={theatrePath(watchlist)} onNavigate={close}>
            Home Theatre
          </MenuLink>
        )}
        {showMyTheatres && (
          <MenuLink href="/theatres" onNavigate={close}>
            Theatres Near You
          </MenuLink>
        )}
        <MenuLink href="/theatres/new" onNavigate={close}>
          New Theatre
        </MenuLink>
        {theatre && (
          <MenuLink
            href={`${theatrePath(theatre)}/settings`}
            onNavigate={close}
          >
            Settings
          </MenuLink>
        )}
        {inviteCode && (
          <MenuButton onClick={() => copyShareLink(inviteCode)}>
            {SHARE_LABELS[shareStatus]}
          </MenuButton>
        )}
        <MenuLink href="/compare" onNavigate={close}>
          Compare
        </MenuLink>
        <MenuButton onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? "Collapse" : "Extra Settings"}
        </MenuButton>
        <hr className={styles.divider} />
        <div className={styles.extraSettings} hidden={!isExpanded}>
          {theatre && (
            <BulkBoxOfficeRefresh
              key={theatre.id}
              theatreId={theatre.id}
              buttonClassName={styles.menuItem}
              onStart={close}
            />
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
      </div>
    </div>
  );
}

const SHARE_LABELS = {
  idle: "Share",
  copied: "Link copied ✓",
  failed: "Couldn't copy link",
};

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
