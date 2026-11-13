"use client";

import { api } from "@/app/lib/api";
import { useAPICall } from "@/app/lib/useAPIActions";
import { authClient } from "@/lib/auth/client";
import type { Movie } from "@/src/db/schema";
import { RefreshButton } from "./RefreshButton";
import styles from "./MovieRefresh.module.css";

interface MovieRefreshProps {
  movieId: number;
  onRefreshed?: (movie: Movie) => void;
}

export function MovieRefresh({ movieId, onRefreshed }: MovieRefreshProps) {
  const { data: session } = authClient.useSession();
  const { isSubmitting, message, fromAPI } = useAPICall();
  if (!session) return null;
  const refresh = fromAPI({
    api: async () => {
      const result = await api.movies.refresh(movieId);
      onRefreshed?.(result.movie);
    },
    action: "refresh movie",
  });
  return (
    <div className={styles.refresh}>
      <RefreshButton
        onClick={refresh}
        busy={isSubmitting}
        label={isSubmitting ? "Refreshing movie..." : "Refresh movie"}
        title="Refresh metadata, ratings, streaming, Wikipedia, box office and trivia"
        showLabel
      />
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
