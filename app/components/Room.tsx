"use client";

import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { NominationPanel } from "@/app/components/NominationPanel";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import { useAPIActions } from "@/app/lib/useAPIActions";
import { useMovieDiscussionHistory } from "@/app/lib/useMovieDiscussionHistory";
import { applyView, ViewContext, ViewState } from "@/app/lib/view";
import type { Movie, Nomination } from "@/src/db/schema";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { find, map, some } from "shades";
import { useRoom } from "../[ownerId]/[slug]/RoomContext";
import styles from "./Room.module.css";

export interface RoomAPI {
  rescind: (nominationId: number) => Promise<void>;
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
  isLoading: boolean;
}

export function Room({
  userId,
  api,
  viewState,
  setViewState,
  viewContext,
  nominees,
  isLoading,
}: RoomProps) {
  const { room, isAdmin } = useRoom();
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const { focusedId, closeDiscussion, openDiscussion } =
    useMovieDiscussionHistory();
  const [isWatchedOpen, setIsWatchedOpen] = useState(false);

  const focused = focusedId
    ? (find({ id: focusedId })(nominees) ?? null)
    : null;

  const { actions, message, isSubmitting } = useAPIActions({
    nominate: {
      api: api.nominate,
      action: "submit your nomination",
      onStart: () => setIsNominationOpen(false),
    },
    rescind: {
      api: api.rescind,
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
    <main className={styles.shell}>
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
          nominateLabel="Add a movie"
          onNominate={() => setIsNominationOpen((open) => !open)}
        />

        <AnimatePresence initial={false}>
          {isNominationOpen && (
            <NominationPanel
              existing={existing}
              isSubmitting={isSubmitting}
              onClose={() => setIsNominationOpen(false)}
              onSubmit={actions.nominate}
            />
          )}
        </AnimatePresence>

        {message && (
          <div className={styles.message} role="status">
            {message}
          </div>
        )}
        {(() => {
          if (isLoading) return <LoadingOverlay />;
          return (
            <>
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
                    onClick={() => openDiscussion(nom.id)}
                  />
                ))}
              </div>
            </>
          );
        })()}
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
                  onClick={() => openDiscussion(nom.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

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
            onDelete={
              isAdmin
                ? () => actions.rescind(focused.id)
                : undefined
            }
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
