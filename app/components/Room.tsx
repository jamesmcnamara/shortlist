"use client";

import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { NominationPanel } from "@/app/components/NominationPanel";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import { getRoomType } from "@/app/lib/rooms";
import { useAPIActions } from "@/app/lib/useAPIActions";
import { applyView, ViewContext, ViewState } from "@/app/lib/view";
import { SafeRoom } from "@/lib/auth/require-room";
import type { Movie, Nomination } from "@/src/db/schema";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { filter, find, some } from "shades";
import { useRoom } from "../r/[slug]/RoomContext";
import styles from "./Room.module.css";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";

export interface RoomAPI {
  rescind: (nominationId: number) => Promise<void>;
  nominate: (candidate: Movie, comment: string) => Promise<void>;
  changeVote: (
    nomination: Nomination,
    action: "add" | "remove",
  ) => Promise<void>;
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
  const { room, currentCycle, nominationsPerCycle, votesPerCycle, isAdmin } =
    useRoom();
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [isWatchedOpen, setIsWatchedOpen] = useState(false);

  const closeDiscussion = () => setFocusedId(null);
  const focused = focusedId
    ? (find({ id: focusedId })(nominees) ?? null)
    : null;

  const myNominationsThisCycle = useMemo(
    () =>
      userId
        ? filter({ userId, cycle: currentCycle, completed: false })(
            nominees as Nomination[],
          )
        : [],
    [nominees, userId, currentCycle],
  );

  // Only a room that allows exactly one nomination has a single "current" one
  // to replace; anywhere else, nominating always adds.
  const replaceableNomination =
    nominationsPerCycle === 1 ? (myNominationsThisCycle[0] ?? null) : null;

  const { actions, message, isSubmitting } = useAPIActions({
    nominate: {
      api: api.nominate,
      action: "submit your nomination",
      onStart: () => setIsNominationOpen(false),
    },
    rescind: {
      api: api.rescind,
      skip: !replaceableNomination?.id,
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
    changeVote: {
      api: api.changeVote,
      action: "update your vote",
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

  const votesLeft = useMemo(() => {
    if (!userId) return 0;
    const cast = filter({ userId, cycle: currentCycle })(
      filter({ completed: false })(nominees).flatMap(
        (nomination) => nomination.votes,
      ),
    ).length;
    return Math.max(0, votesPerCycle - cast);
  }, [nominees, userId, currentCycle, votesPerCycle]);

  const canVoteOn = (nomination: Nomination) =>
    votesLeft > 0 && (room.allowSelfVote || nomination.userId !== userId);

  const canDeleteNominations = isAdmin && getRoomType(room) === "watchlist";

  return (
    <main className={styles.shell}>
      <ShortlistHeader votesLeft={votesLeft} />

      <section
        className={styles.nominations}
        aria-labelledby="nominations-title"
      >
        <h1 id="nominations-title" className={styles.sectionHeader}>
          {headline(room)}
        </h1>

        <ViewControls
          state={viewState}
          onChange={setViewState}
          context={viewContext}
          nominateLabel={nominateLabel(
            nominationsPerCycle,
            Boolean(replaceableNomination),
          )}
          onNominate={() => setIsNominationOpen((open) => !open)}
        />

        <AnimatePresence initial={false}>
          {isNominationOpen && (
            <NominationPanel
              currentNomination={replaceableNomination}
              existing={existing}
              isSubmitting={isSubmitting}
              roomType={getRoomType(room)}
              onClose={() => setIsNominationOpen(false)}
              onSubmit={actions.nominate}
              onRescind={() => actions.rescind(replaceableNomination!.id)}
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
              <div id="tour-nominations" className={styles.movieList}>
                {visible.map((nom, index) => (
                  <MovieCard
                    key={nom.id}
                    rank={index + 1}
                    nomination={nom}
                    hasSeen={some({ id: userId })(nom.seenBy)}
                    hasUpvoted={some({ userId })(nom.votes)}
                    canVote={canVoteOn(nom)}
                    isExpanded={focused === nom}
                    onAddVote={() => actions.changeVote(nom, "add")}
                    onToggleDiscussion={() =>
                      setFocusedId(focused === nom ? null : nom.id)
                    }
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
                  hasUpvoted={some({ userId })(nom.votes)}
                  canVote={canVoteOn(nom)}
                  isExpanded={focused === nom}
                  isCompleted
                  onAddVote={() => actions.changeVote(nom, "add")}
                  onToggleDiscussion={() =>
                    setFocusedId(focused === nom ? null : nom.id)
                  }
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
            hasUpvoted={some({ userId })(focused.votes)}
            hasSeen={some({ id: userId })(focused.seenBy)}
            canVote={canVoteOn(focused)}
            currentUserId={userId ?? null}
            onAddVote={() => actions.changeVote(focused, "add")}
            onRemoveVote={() => actions.changeVote(focused, "remove")}
            onAddComment={(comment) => actions.addNomCom(focused.id, comment)}
            onUpdateNominationComment={(comment) =>
              actions.updateNomRec(focused.id, comment)
            }
            onUpdateComment={actions.updateNomCom}
            onMarkWatched={() => actions.toggleWatched(focused.movieId)}
            onDelete={
              canDeleteNominations
                ? () => actions.rescind(focused.id)
                : undefined
            }
            onToggleCompleted={
              isAdmin ? () => actions.toggleCompleted(focused.id) : undefined
            }
            onClose={closeDiscussion}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

interface MovieListProps {
  visible: Nomination[];
  nominees: Nomination[];
  userId: string | null;
  focused: Nomination | null;
  actions: any;
  setFocusedId: (id: number | null) => void;
  canVoteOn: (nom: Nomination) => boolean;
}

const MovieList = ({
  visible,
  nominees,
  userId,
  focused,
  actions,
  setFocusedId,
  canVoteOn,
}: MovieListProps) => (
  <>
    {visible.length === 0 && (
      <p className={styles.message} role="status">
        {nominees.length === 0
          ? "Nothing here yet. Add the first movie."
          : "No movies match these filters."}
      </p>
    )}
    <div id="tour-nominations" className={styles.movieList}>
      {visible.map((nom, index) => (
        <MovieCard
          key={nom.id}
          rank={index + 1}
          nomination={nom}
          hasSeen={some({ id: userId })(nom.seenBy)}
          hasUpvoted={some({ userId })(nom.votes)}
          canVote={canVoteOn(nom)}
          isExpanded={focused === nom}
          onAddVote={() => actions.changeVote(nom, "add")}
          onToggleDiscussion={() =>
            setFocusedId(focused === nom ? null : nom.id)
          }
        />
      ))}
    </div>
  </>
);

const headline = (room: SafeRoom) =>
  room.nominationsPerCycle === 1 ? "And the nominees are..." : room.name;

const nominateLabel = (
  nominationsPerCycle: number | null,
  hasNomination: boolean,
) => {
  if (nominationsPerCycle !== 1) return "Add a movie";
  return hasNomination ? "Replace your nomination" : "Choose your fighter";
};
