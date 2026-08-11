"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import styles from "./ShortlistHeader.module.css";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ShortlistHeaderProps = {
  votesLeft: number;
};

export function ShortlistHeader({ votesLeft }: ShortlistHeaderProps) {
  const { data: session } = authClient.useSession();
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
      </div>
      {name ? (
        <div className={styles.profile}>
          <span className={styles.voteBalance}>
            {votesLeft} {votesLeft === 1 ? "vote" : "votes"} left
          </span>
          <div className={styles.identity}>
            <span className="avatar avatar-violet">{initialsFor(name)}</span>
            <span className={styles.name}>{name}</span>
          </div>
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
