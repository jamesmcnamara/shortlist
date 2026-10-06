"use client";

import { compareHref, MAX_MOVIES } from "@/app/compare/metrics";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import { useAPIActions } from "@/app/lib/useAPIActions";
import { useMovieDiscussionHistory } from "@/app/lib/useMovieDiscussionHistory";
import { applyView, ViewContext, ViewState } from "@/app/lib/view";
import type { Movie, Nomination } from "@/src/db/schema";
import classnames from "classnames";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { find, map, some } from "shades";
import { useRoom } from "../[ownerId]/[slug]/RoomContext";
import styles from "./Room.module.css";

export interface RoomAPI {
  delete: (nominationId: number) => Promise<void>;
  nominate: (candidate: Movie, comment: string) => Promise<void>;
  addNomCom: (nominationId: number, comment: string) => Promise<void>;
  updateNomRec: (nominationId: number, comment: string) => Promise<void>;
  toggleWatched: (movieId: number) => Promise<void>;
  updateNomCom: (nomcomId: number, comment: string) => Promise<void>;
  toggleCompleted: (nominationId: number) => Promise<void>;
}

interface RoomProps {
  nominees: Nomination[];
  viewState: ViewState;
  setViewState: (next: ViewState) => void;
  viewContext: ViewContext;
  userId: string | undefined;
  api: RoomAPI;
}

export function Room({
  userId,
  api,
  viewState,
  setViewState,
  viewContext,
  nominees,
}: RoomProps) {
  const { room, isAdmin } = useRoom();
  const { focusedId, closeDiscussion, openDiscussion } =
    useMovieDiscussionHistory();
  const [isWatchedOpen, setIsWatchedOpen] = useState(false);
  // TMDB ids picked for comparison, or null when not picking.
  const [comparing, setComparing] = useState<number[] | null>(null);
  const router = useRouter();
  const isComparing = comparing !== null;

  useEffect(() => {
    if (!isComparing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setComparing(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isComparing]);

  const togglePick = (tmdbId: number) =>
    setComparing((current) =>
      !current
        ? [tmdbId]
        : current.includes(tmdbId)
          ? current.filter((id) => id !== tmdbId)
          : current.length < MAX_MOVIES
            ? [...current, tmdbId]
            : current,
    );

  const cardProps = (nom: Nomination) => {
    const { tmdbId } = nom.movie;
    return {
      isSelected: comparing
        ? tmdbId !== null && comparing.includes(tmdbId)
        : undefined,
      onClick: () => {
        if (!comparing) openDiscussion(nom.id);
        else if (tmdbId !== null) togglePick(tmdbId);
      },
      onLongPress: () => {
        if (tmdbId !== null) togglePick(tmdbId);
      },
    };
  };

  const focused = focusedId
    ? (find({ id: focusedId })(nominees) ?? null)
    : null;

  const { actions, message, isSubmitting } = useAPIActions({
    nominate: {
      api: api.nominate,
      action: "submit your nomination",
    },
    delete: {
      api: api.delete,
      onSuccess: closeDiscussion,
      action: "rescind your nomination",
    },
    toggleWatched: {
      api: api.toggleWatched,
      action: "update your watched status",
    },
    addNomCom: {
      api: api.addNomCom,
      action: "add your comment",
    },
    updateNomCom: {
      api: api.updateNomCom,
      action: "update your comment",
    },
    updateNomRec: {
      api: api.updateNomRec,
      action: "update your recommendation",
    },
    toggleCompleted: {
      api: api.toggleCompleted,
      action: "update the completed status",
    },
  });

  const visible = useMemo(
    () =>
      applyView(
        nominees.filter((nom) => !nom.completed),
        viewState,
        viewContext,
      ),
    [nominees, viewState, viewContext],
  );

  const watched = useMemo(
    () => nominees.filter((nom) => nom.completed),
    [nominees],
  );

  const existing = useMemo(
    () =>
      new Set(
        nominees.map((nom) => nom.movie.tmdbId).filter(Boolean) as number[],
      ),
    [nominees],
  );

  const showMeta = new Set(map("userId")(nominees)).size > 2;

  return (
    <main
      className={classnames(styles.shell, {
        [styles.shellComparing]: isComparing,
      })}
    >
      <ShortlistHeader />

      <section
        className={styles.nominations}
        aria-labelledby="nominations-title"
      >
        <h1 id="nominations-title" className={styles.sectionHeader}>
          {room.name}
        </h1>

        <ViewControls
          state={viewState}
          onChange={setViewState}
          existing={existing}
          isSubmitting={isSubmitting}
          onNominate={actions.nominate}
        />

        {message && (
          <div className={styles.message} role="status">
            {message}
          </div>
        )}
        {visible.length === 0 && (
          <p className={styles.message} role="status">
            {nominees.length === 0
              ? "Nothing here yet. Add the first movie."
              : "No movies match these filters."}
          </p>
        )}
        <div className={styles.movieList}>
          {visible.map((nom, index) => (
            <MovieCard
              key={nom.id}
              rank={index + 1}
              nomination={nom}
              hasSeen={some({ id: userId })(nom.seenBy)}
              isExpanded={focused === nom}
              showMeta={showMeta}
              {...cardProps(nom)}
            />
          ))}
        </div>
      </section>

      {watched.length > 0 && (
        <section className={styles.nominations} aria-labelledby="watched-title">
          <button
            type="button"
            className={styles.watchedToggle}
            id="watched-title"
            aria-expanded={isWatchedOpen}
            onClick={() => setIsWatchedOpen((open) => !open)}
          >
            {isWatchedOpen ? "▾" : "▸"} Watched
          </button>

          {isWatchedOpen && (
            <div className={styles.movieList}>
              {watched.map((nom, index) => (
                <MovieCard
                  key={nom.id}
                  rank={index + 1}
                  nomination={nom}
                  hasSeen={some({ id: userId })(nom.seenBy)}
                  showMeta={true}
                  isExpanded={focused === nom}
                  isCompleted
                  {...cardProps(nom)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <AnimatePresence>
        {comparing && (
          <motion.div
            className={styles.compareBar}
            role="region"
            aria-label="Compare movies"
            initial={{ y: "120%" }}
            animate={{ y: 0 }}
            exit={{ y: "120%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <span aria-live="polite">
              {comparing.length} of {MAX_MOVIES} picked
            </span>
            <button
              type="button"
              className={styles.compareCancel}
              onClick={() => setComparing(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.compareGo}
              disabled={comparing.length < 2}
              onClick={() => router.push(compareHref(comparing))}
            >
              Compare
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {focused && (
          <MovieDiscussion
            key={focused.id}
            nomination={focused}
            hasSeen={some({ id: userId })(focused.seenBy)}
            currentUserId={userId ?? null}
            onAddComment={(comment) => actions.addNomCom(focused.id, comment)}
            onUpdateNominationComment={(comment) =>
              actions.updateNomRec(focused.id, comment)
            }
            onUpdateComment={actions.updateNomCom}
            onMarkWatched={() => actions.toggleWatched(focused.movieId)}
            onDelete={isAdmin ? () => actions.delete(focused.id) : undefined}
            onToggleCompleted={
              isAdmin
                ? () => {
                    actions.toggleCompleted(focused.id);
                    closeDiscussion();
                  }
                : undefined
            }
            onClose={closeDiscussion}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
