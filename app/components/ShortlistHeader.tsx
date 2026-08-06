"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import styles from "./ShortlistHeader.module.css";

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ShortlistHeader() {
  const { data: session } = authClient.useSession();
  const [votesRemaining, setVotesRemaining] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const router = useRouter();
  const name = session?.user?.name || session?.user?.email || "";

  useEffect(() => {
    const loadProfile = () => {
      if (!session?.user) return;
      fetch("/api/me").then((response) => response.ok ? response.json() : null).then((data) => {
        if (data) setVotesRemaining(data.votesRemaining);
      }).catch(() => undefined);
    };
    loadProfile();
    window.addEventListener("shortlist-votes-updated", loadProfile);
    return () => window.removeEventListener("shortlist-votes-updated", loadProfile);
  }, [session?.user]);

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
          {votesRemaining !== null && <span className={styles.voteBalance}>{votesRemaining} votes left</span>}
          <span className="avatar avatar-violet">{initialsFor(name)}</span>
          <span>{name}</span>
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
