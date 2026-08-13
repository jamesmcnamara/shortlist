"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { some, find, filter } from "shades";
import { authClient } from "@/lib/auth/client";
import { getMonth } from "@/app/lib/utils";
import type { MovieSearchResult } from "./components/MovieSearchResult";
import { MovieCard, MovieDiscussion } from "./components/MovieCard";
import { NominationPanel } from "./components/NominationPanel";
import { ShortlistHeader } from "./components/ShortlistHeader";
import type { Nomination, User } from "@/src/db/schema";
import styles from "./page.module.css";
import { VOTES_PER_MONTH } from "./lib/constants";
import { api, ApiError } from "./lib/api";

export default function Home() {
  const { data: session } = authClient.useSession();
  const [nominations, setNominations] = useState(new Map<number, Nomination>());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<number | null>(null);

  const closeDiscussion = () => setFocusedId(null);
  const focused = focusedId && nominations.get(focusedId);

  useEffect(() => {
    api.nominations
      .list()
      .then(mapify)
      .then(setNominations)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  const currentMonth = getMonth();

  const nominees = Array.from(nominations.values()).sort(
    (a, b) => b.votes.length - a.votes.length,
  );

  const currentNomination = getCurrentNomination(
    nominations,
    session?.user?.id,
    currentMonth,
  );

  const votesLeft = calculateVotesLeft(
    nominations,
    session?.user?.id,
    currentMonth,
  );

  const nominate = async (candidate: MovieSearchResult, comment: string) => {
    if (currentNomination || isSubmitting) return;
    setMessage("");
    setIsSubmitting(true);
    try {
      const data = await api.nominations.create({
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
        action === "add" ? api.votes.create : api.votes.delete
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
      const nomination = await api.nomcoms.create(nominationId, comment);
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
      await api.nominations.delete(nominationId);
      setNominations((prev) => {
        const next = new Map(prev);
        next.delete(nominationId);
        return next;
      });
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

  return (
    <main className={styles.shell}>
      <ShortlistHeader votesLeft={votesLeft} />

      <section
        className={styles.nominations}
        aria-labelledby="nominations-title"
      >
        <header className={styles.sectionHeader}>
          <div className={styles.sectionIntro}>
            <h1 id="nominations-title">And the nominees are...</h1>
          </div>
          <button
            className={styles.nominateButton}
            type="button"
            onClick={() => setIsNominationOpen((open) => !open)}
          >
            {currentNomination
              ? "Replace your nomination"
              : "Choose your fighter"}
          </button>
        </header>

        <AnimatePresence initial={false}>
          {isNominationOpen && (
            <NominationPanel
              currentNomination={currentNomination}
              isSubmitting={isSubmitting}
              onClose={() => setIsNominationOpen(false)}
              onSubmit={nominate}
              onRescind={() =>
                currentNomination && rescindNomination(currentNomination.id)
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
              hasUpvoted={some({ userId: session?.user?.id })(nom.votes)}
              canVote={session?.user?.id !== nom.nominator.id && votesLeft > 0}
              isExpanded={focused === nom}
              onAddVote={() => changeVote(nom, "add")}
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
            hasUpvoted={some({ userId: session?.user?.id })(focused.votes)}
            canVote={
              focused.nominator.id !== session?.user?.id && votesLeft > 0
            }
            onAddVote={() => changeVote(focused, "add")}
            onRemoveVote={() => changeVote(focused, "remove")}
            onAddComment={(comment) =>
              addNominationComment(focused.id, comment)
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

const getCurrentNomination = (
  nominations: Map<number, Nomination>,
  userId: string | undefined,
  month: number,
): Nomination | null => {
  if (!userId) return null;
  return (
    find({ nominator: { id: userId }, month })(
      Array.from(nominations.values()),
    ) ?? null
  );
};

const calculateVotesLeft = (
  nominations: Map<number, Nomination>,
  userId: string | undefined,
  month: number,
): number => {
  if (!userId) return 0;
  const votes = [
    ...nominations.values().flatMap((nomination) => nomination.votes),
  ];
  const cast = filter({ userId, month })(votes).length;
  return Math.max(0, VOTES_PER_MONTH - cast);
};
