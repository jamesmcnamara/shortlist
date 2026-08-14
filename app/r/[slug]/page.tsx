"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { some, filter } from "shades";
import { authClient } from "@/lib/auth/client";
import type { MovieSearchResultData } from "@/app/components/MovieSearchResult";
import { MovieCard, MovieDiscussion } from "@/app/components/MovieCard";
import { NominationPanel } from "@/app/components/NominationPanel";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import { applyView, parseViewState, toSearchParams } from "@/app/lib/view";
import type { Nomination } from "@/src/db/schema";
import styles from "@/app/page.module.css";
import { ApiError } from "@/app/lib/api";
import { useRoom } from "./RoomContext";

export default function RoomPage() {
  const { room, client, currentCycle, nominationsPerCycle, votesPerCycle } =
    useRoom();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [nominations, setNominations] = useState(new Map<number, Nomination>());
  const [watchedMovieIds, setWatchedMovieIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const userId = session?.user?.id;
  const closeDiscussion = () => setFocusedId(null);
  const focused = focusedId ? (nominations.get(focusedId) ?? null) : null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.nominations.list(), client.seen.list()])
      .then(([list, watched]) => {
        if (cancelled) return;
        setNominations(mapify(list));
        setWatchedMovieIds(new Set(watched.map((entry) => entry.movieId)));
      })
      .catch((error: Error) => !cancelled && setMessage(error.message));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const all = useMemo(() => Array.from(nominations.values()), [nominations]);

  const viewContext = useMemo(
    () => ({ room, currentCycle, userId, watchedMovieIds }),
    [room, currentCycle, userId, watchedMovieIds],
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

  const nominationsLeft =
    nominationsPerCycle === null
      ? null
      : Math.max(0, nominationsPerCycle - myNominationsThisCycle.length);

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

  /** Watching is a room-level fact, so this toggles for everyone. */
  async function toggleWatched(movieId: number) {
    const watched = watchedMovieIds.has(movieId);
    setMessage("");
    try {
      await (watched ? client.seen.delete : client.seen.create)(movieId);
      setWatchedMovieIds((prev) => {
        const next = new Set(prev);
        if (watched) next.delete(movieId);
        else next.add(movieId);
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

  return (
    <main className={styles.shell}>
      <ShortlistHeader
        votesLeft={votesLeft}
        nominationsLeft={nominationsLeft}
      />

      <section
        className={styles.nominations}
        aria-labelledby="nominations-title"
      >
        <header className={styles.sectionHeader}>
          <div className={styles.sectionIntro}>
            <h1 id="nominations-title">{headline(nominationsPerCycle)}</h1>
          </div>
          <button
            className={styles.nominateButton}
            type="button"
            onClick={() => setIsNominationOpen((open) => !open)}
          >
            {nominateLabel(nominationsPerCycle, Boolean(replaceableNomination))}
          </button>
        </header>

        <ViewControls
          state={viewState}
          onChange={setViewState}
          context={viewContext}
        />

        <AnimatePresence initial={false}>
          {isNominationOpen && (
            <NominationPanel
              currentNomination={replaceableNomination}
              isSubmitting={isSubmitting}
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
        <div className={styles.movieList}>
          {nominees.map((nom, index) => (
            <MovieCard
              key={nom.id}
              rank={index + 1}
              nomination={nom}
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
            canVote={canVoteOn(focused)}
            onAddVote={() => changeVote(focused, "add")}
            onRemoveVote={() => changeVote(focused, "remove")}
            onAddComment={(comment) =>
              addNominationComment(focused.id, comment)
            }
            onMarkWatched={() => toggleWatched(focused.movieId)}
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
