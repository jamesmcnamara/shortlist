"use client";

import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import type { MovieSearchResultData } from "@/app/components/MovieSearchResult";
import { NominationPanel } from "@/app/components/NominationPanel";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import { getRoomType } from "@/app/lib/rooms";
import { useAPIActions } from "@/app/lib/useAPIActions";
import { applyView, ViewContext, ViewState } from "@/app/lib/view";
import { SafeRoom } from "@/lib/auth/require-room";
import type { Nomination } from "@/src/db/schema";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { filter, find, some } from "shades";
import { useRoom } from "../r/[slug]/RoomContext";
import styles from "./Room.module.css";

export interface RoomAPI {
  rescind: (nominationId: number) => Promise<void>;
  nominate: (
    candidate: MovieSearchResultData,
    comment: string,
  ) => Promise<void>;
  changeVote: (
    nomination: Nomination,
    action: "add" | "remove",
  ) => Promise<void>;
  addNomCom: (nominationId: number, comment: string) => Promise<void>;
  updateNomRec: (nominationId: number, comment: string) => Promise<void>;
  toggleWatched: (movieId: number) => Promise<void>;
  updateNomCom: (nomcomId: number, comment: string) => Promise<void>;
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
  const { room, currentCycle, nominationsPerCycle, votesPerCycle, isAdmin } =
    useRoom();
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const closeDiscussion = () => setFocusedId(null);
  const focused = focusedId
    ? (find({ id: focusedId })(nominees) ?? null)
    : null;

  const myNominationsThisCycle = useMemo(
    () =>
      userId
        ? filter({ userId, cycle: currentCycle })(nominees as Nomination[])
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
  });

  const visible = useMemo(
    () => applyView(nominees, viewState, viewContext),
    [nominees, viewState, viewContext],
  );

  const votesLeft = useMemo(() => {
    if (!userId) return 0;
    const cast = filter({ userId, cycle: currentCycle })(
      nominees.flatMap((nomination) => nomination.votes),
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
      </section>
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
            onClose={closeDiscussion}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

const headline = (room: SafeRoom) =>
  room.nominationsPerCycle === 1 ? "And the nominees are..." : room.name;

const nominateLabel = (
  nominationsPerCycle: number | null,
  hasNomination: boolean,
) => {
  if (nominationsPerCycle !== 1) return "Add a movie";
  return hasNomination ? "Replace your nomination" : "Choose your fighter";
};
