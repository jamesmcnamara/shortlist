"use client";

import { api } from "@/app/lib/api";
import { useAPICall } from "@/app/lib/useAPIActions";
import { authClient } from "@/lib/auth/client";
import type { Movie } from "@/src/db/schema";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import PullToRefresh from "react-simple-pull-to-refresh";
import { LoadingOverlay } from "./LoadingOverlay";
import styles from "./MovieRefresh.module.css";

interface MovieRefreshProps {
  movieId: number;
  onRefreshed?: (movie: Movie) => void;
  children: ReactNode;
  className?: string;
}

export function MovieRefresh({
  movieId,
  onRefreshed,
  children,
  className,
}: MovieRefreshProps) {
  const { data: session } = authClient.useSession();
  const { isSubmitting, message, fromAPI } = useAPICall();
  const instructionsId = useId();
  const inFlight = useRef(false);
  const runRefresh = fromAPI({
    api: async () => {
      const result = await api.movies.refresh(movieId);
      onRefreshed?.(result.movie);
      if (result.failed.length) {
        throw new Error(
          `Couldn't refresh ${result.failed.join(", ")}. Other updates were saved. Pull down again to retry.`,
        );
      }
    },
    action: "refresh movie",
  });
  const refresh = async () => {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    try {
      await runRefresh();
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <div
      className={className}
      tabIndex={session ? 0 : undefined}
      aria-describedby={session ? instructionsId : undefined}
      aria-busy={isSubmitting}
      onMouseDownCapture={(event) => event.stopPropagation()}
      onTouchStartCapture={(event) => {
        const target = event.target;
        if (
          event.touches.length !== 1 ||
          (target instanceof Element &&
            target.closest(
              "a, button, input, textarea, select, summary, [contenteditable]",
            )) ||
          window.getSelection()?.isCollapsed === false
        ) {
          event.stopPropagation();
        }
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter") {
          event.preventDefault();
          void refresh();
        }
      }}
    >
      {session && (
        <span id={instructionsId} className="srOnly">
          Pull down at the top or press Enter here to refresh movie data.
        </span>
      )}
      <PullToRefresh
        className={styles.pull}
        isPullable={Boolean(session) && !isSubmitting}
        onRefresh={refresh}
        pullDownThreshold={80}
        pullingContent={
          <span className={styles.hint}>Pull down to refresh</span>
        }
      >
        <div>{children}</div>
      </PullToRefresh>
      {isSubmitting &&
        createPortal(
          <div onPointerDown={(event) => event.stopPropagation()}>
            <LoadingOverlay label="Refreshing movie..." translucent />
          </div>,
          document.body,
        )}
      {message && (
        <p className={styles.error} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
