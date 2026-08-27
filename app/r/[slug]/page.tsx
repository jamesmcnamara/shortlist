"use client";

import { MovieCard, MovieDiscussion } from "@/app/components/MovieCard";
import type { MovieSearchResultData } from "@/app/components/MovieSearchResult";
import { NominationPanel } from "@/app/components/NominationPanel";
import { useFirstRoomTour } from "@/app/components/onboarding/useFirstRoomTour";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import { ApiError } from "@/app/lib/api";
import { getRoomType } from "@/app/lib/rooms";
import { applyView, parseViewState, toSearchParams } from "@/app/lib/view";
import styles from "@/app/page.module.css";
import { authClient } from "@/lib/auth/client";
import type { Nomination } from "@/src/db/schema";
import { AnimatePresence } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { filter, some } from "shades";
import { useRoom } from "./RoomContext";

export default function RoomPage() {
  return (
    <Suspense fallback={null}>
      <RoomPageContent />
    </Suspense>
  );
}

function RoomPageContent() {
  const {
    room,
    client,
    currentCycle,
    nominationsPerCycle,
    votesPerCycle,
    isAdmin,
  } = useRoom();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [nominations, setNominations] = useState(new Map<number, Nomination>());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [nominationsLoaded, setNominationsLoaded] = useState(false);

  const userId = session?.user?.id;
  const closeDiscussion = () => setFocusedId(null);
  const focused = focusedId ? (nominations.get(focusedId) ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    client.nominations
      .list()
      .then((list) => {
        if (cancelled) return;
        setNominations(mapify(list));
        setNominationsLoaded(true);
      })
      .catch((error: Error) => !cancelled && setMessage(error.message));
    return () => {
      cancelled = true;
    };
  }, [client]);

  useFirstRoomTour({
    roomType: getRoomType(room),
    isReady: nominationsLoaded,
  });

  const all = useMemo(() => Array.from(nominations.values()), [nominations]);

  const viewContext = useMemo(
    () => ({ room, currentCycle, userId }),
    [room, currentCycle, userId],
  );

  const viewState = useMemo(
    () => parseViewState(new URLSearchParams(searchParams.toString()), room),
    [searchParams, room],
  );

  const nominees = useMemo(
    () => applyView(all, viewState, viewContext),
    [all, viewState, viewContext],
  );

  const setViewState = useCallback(
    (next: typeof viewState) => {
      const params = toSearchParams(next, room);
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [room, router],
  );

  const myNominationsThisCycle = useMemo(
    () =>
      userId
        ? filter({ userId, cycle: currentCycle })(all as Nomination[])
        : [],
    [all, userId, currentCycle],
  );

  // Only a room that allows exactly one nomination has a single "current" one
  // to replace; anywhere else, nominating always adds.
  const replaceableNomination =
    nominationsPerCycle === 1 ? (myNominationsThisCycle[0] ?? null) : null;

  const votesLeft = useMemo(() => {
    if (!userId) return 0;
    const cast = filter({ userId, cycle: currentCycle })(
      all.flatMap((nomination) => nomination.votes),
    ).length;
    return Math.max(0, votesPerCycle - cast);
  }, [all, userId, currentCycle, votesPerCycle]);

  const nominate = async (
    candidate: MovieSearchResultData,
    comment: string,
  ) => {
    if (isSubmitting) return;
    setMessage("");
    setIsSubmitting(true);
    try {
      const data = await client.nominations.create({
        tmdbId: candidate.id,
        comment,
      });
      setNominations((prev) => new Map(prev).set(data.id, data));
      setIsNominationOpen(false);
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        return;
      }
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  async function changeVote(nom: Nomination, action: "add" | "remove") {
    setMessage("");
    try {
      const nomination = await (
        action === "add" ? client.votes.create : client.votes.delete
      )(nom.id);
      setNominations((prev) => new Map(prev).set(nomination.id, nomination));
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message);
        return;
      }
      throw error;
    }
  }

  async function addNominationComment(
    nominationId: number,
    comment: string,
  ): Promise<boolean> {
    setMessage("");
    try {
      const nomination = await client.nomcoms.create(nominationId, comment);
      setNominations((prev) => new Map(prev).set(nomination.id, nomination));
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to add your comment.",
      );
      return false;
    }
  }

  async function updateNominationComment(
    nominationId: number,
    comment: string,
  ): Promise<boolean> {
    setMessage("");
    try {
      const nomination = await client.nominations.updateComment(
        nominationId,
        comment,
      );
      setNominations((prev) => new Map(prev).set(nomination.id, nomination));
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your nomination.",
      );
      return false;
    }
  }

  async function updateNomcom(
    nomcomId: number,
    comment: string,
  ): Promise<boolean> {
    setMessage("");
    try {
      const nomination = await client.nomcoms.update(nomcomId, comment);
      setNominations((prev) => new Map(prev).set(nomination.id, nomination));
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update your comment.",
      );
      return false;
    }
  }

  async function rescindNomination(nominationId: number) {
    setMessage("");
    setIsSubmitting(true);
    try {
      await client.nominations.delete(nominationId);
      setNominations((prev) => {
        const next = new Map(prev);
        next.delete(nominationId);
        return next;
      });
      if (focusedId === nominationId) closeDiscussion();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to rescind your nomination.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Seen is personal, so this toggles only the current user — but the update
   * lands on every nomination of that movie, since they all report the same
   * room-scoped viewer list.
   */
  async function toggleWatched(movieId: number) {
    if (!userId) return;
    const nomination = Array.from(nominations.values()).find(
      (candidate) => candidate.movieId === movieId,
    );
    const hasSeen = Boolean(
      nomination?.seenBy.some((user) => user.id === userId),
    );
    setMessage("");
    try {
      const { seenBy } = await (
        hasSeen ? client.seen.delete : client.seen.create
      )(movieId);
      setNominations((prev) => {
        const next = new Map(prev);
        for (const [id, candidate] of prev) {
          if (candidate.movieId === movieId)
            next.set(id, { ...candidate, seenBy });
        }
        return next;
      });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update that movie.",
      );
    }
  }

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
          {headline(nominationsPerCycle)}
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
              onSubmit={nominate}
              onRescind={() =>
                replaceableNomination &&
                rescindNomination(replaceableNomination.id)
              }
            />
          )}
        </AnimatePresence>

        {message && (
          <div className={styles.message} role="status">
            {message}
          </div>
        )}
        <div id="tour-nominations" className={styles.movieList}>
          {nominees.map((nom, index) => (
            <MovieCard
              key={nom.id}
              rank={index + 1}
              nomination={nom}
              hasSeen={some({ id: userId })(nom.seenBy)}
              hasUpvoted={some({ userId })(nom.votes)}
              canVote={canVoteOn(nom)}
              isExpanded={focused === nom}
              onAddVote={() => changeVote(nom, "add")}
              onToggleDiscussion={() =>
                setFocusedId(focused === nom ? null : nom.id)
              }
            />
          ))}
          {nominees.length === 0 && (
            <p className={styles.message} role="status">
              {all.length === 0
                ? "Nothing here yet. Add the first movie."
                : "No movies match these filters."}
            </p>
          )}
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
            onAddVote={() => changeVote(focused, "add")}
            onRemoveVote={() => changeVote(focused, "remove")}
            onAddComment={(comment) =>
              addNominationComment(focused.id, comment)
            }
            onUpdateNominationComment={(comment) =>
              updateNominationComment(focused.id, comment)
            }
            onUpdateComment={updateNomcom}
            onMarkWatched={() => toggleWatched(focused.movieId)}
            onDelete={
              canDeleteNominations
                ? () => rescindNomination(focused.id)
                : undefined
            }
            onClose={closeDiscussion}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

const mapify = <T extends { id: number }>(arr: T[]): Map<number, T> =>
  new Map(arr.map((item) => [item.id, item]));

const headline = (nominationsPerCycle: number | null) =>
  nominationsPerCycle === 1 ? "And the nominees are..." : "On the list";

const nominateLabel = (
  nominationsPerCycle: number | null,
  hasNomination: boolean,
) => {
  if (nominationsPerCycle !== 1) return "Add a movie";
  return hasNomination ? "Replace your nomination" : "Choose your fighter";
};
