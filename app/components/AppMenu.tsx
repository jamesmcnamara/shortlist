"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { useClickOutside } from "@/app/lib/useClickOutside";
import { FilmReelIcon } from "./FilmReelIcon";
import { theatrePath } from "@/lib/theatre-path";
import { userPath } from "@/lib/user-path";
import { useTheatres } from "@/app/lib/data/queries";
import { disconnectDeviceNotifications } from "@/app/lib/push";
import styles from "./AppMenu.module.css";
import { BulkBoxOfficeRefresh } from "./BulkBoxOfficeRefresh";

export interface AppMenuProps {
  /** Omitted outside a theatre, which hides the theatre-scoped items. */
  theatre?: { id: string; isMember?: boolean };
  showMyTheatres?: boolean;
  additionalMenuItems?: AdditionalMenuItem[];
}

export type AdditionalMenuItem =
  | {
      type: "link";
      href: string;
      onNavigate: () => void;
      label: string;
    }
  | {
      type: "button";
      onClick: () => void;
      label: string;
    };

/** The account and navigation menu, shared by every header. */
export function AppMenu({
  theatre,
  showMyTheatres = true,
  additionalMenuItems,
}: AppMenuProps) {
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

  async function copyShareLink(theatreId: string) {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${theatrePath({ id: theatreId })}`,
      );
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
    }
  }

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
        {showMyTheatres && session?.user.id && (
          <MenuLink href={userPath(session.user.id)} onNavigate={close}>
            My Theatres
          </MenuLink>
        )}
        {name && (
          <MenuLink href="/theatres/new" onNavigate={close}>
            New Theatre
          </MenuLink>
        )}
        {theatre?.isMember && (
          <MenuLink
            href={`${theatrePath(theatre)}/settings`}
            onNavigate={close}
          >
            Settings
          </MenuLink>
        )}
        {theatre && (
          <MenuButton onClick={() => copyShareLink(theatre.id)}>
            {SHARE_LABELS[shareStatus]}
          </MenuButton>
        )}
        <MenuLink href="/compare" onNavigate={close}>
          Compare
        </MenuLink>
        {!name && (
          <MenuLink href="/auth/sign-in" onNavigate={close}>
            Sign in
          </MenuLink>
        )}
        {name && (
          <MenuButton onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? "Collapse" : "Extra Settings"}
          </MenuButton>
        )}
        <hr className={styles.divider} />
        <div className={styles.extraSettings} hidden={!isExpanded}>
          {name && theatre && (
            <BulkBoxOfficeRefresh
              key={theatre.id}
              theatreId={theatre.id}
              buttonClassName={styles.menuItem}
              onStart={close}
            />
          )}
          {name && <MenuLink href="/feedback" onNavigate={close}>
            Feedback
          </MenuLink>}
          {name && additionalMenuItems?.map((item, index) =>
            item.type === "link" ? (
              <MenuLink
                key={index}
                href={item.href}
                onNavigate={item.onNavigate}
              >
                {item.label}
              </MenuLink>
            ) : (
              <MenuButton key={index} onClick={item.onClick}>
                {item.label}
              </MenuButton>
            ),
          )}
          {name && (
            <button
              className={styles.menuItem}
              type="button"
              role="menuitem"
              disabled={isSigningOut}
              onClick={signOut}
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          )}
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
