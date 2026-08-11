"use client";

import { SubmitEventHandler, useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { some, filter } from "shades";
import { authClient } from "@/lib/auth/client";
import { getMonth } from "@/app/lib/date-utils";
import type { MovieSearchResultData } from "./components/MovieSearchResult";
import { MovieCard, MovieDiscussion } from "./components/MovieCard";
import { NominationPanel } from "./components/NominationPanel";
import { ShortlistHeader } from "./components/ShortlistHeader";
import type { Nomination, User } from "@/src/db/schema";
import styles from "./page.module.css";
import { VOTES_PER_MONTH } from "./lib/constants";
import { api, ApiError } from "./lib/api";

export default function Home() {
  const { data: session } = authClient.useSession();
  const [nominations, setNominations] = useState(
    () => new Map<number, Nomination>(),
  );
  const [query, setQuery] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [searchResults, setSearchResults] = useState<MovieSearchResultData[]>(
    [],
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedMovie, setSelectedMovie] =
    useState<MovieSearchResultData | null>(null);
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

  useEffect(() => {
    if (!isNominationOpen || selectedMovie || query.length < 2) {
      setSearchResults([]);
      setSearchError("");
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError("");
      try {
        const data = await api.tmdb.search(query, controller.signal);
        setSearchResults(data.results);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setSearchError(
          error instanceof Error ? error.message : "Search failed.",
        );
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, isNominationOpen, selectedMovie]);

  const nominees = Array.from(nominations.values()).sort(
    (a, b) => b.votes.length - a.votes.length,
  );
  const userHasNominatedThisMonth = hasUserNominatedThisMonth(
    nominations,
    session?.user?.id,
    currentMonth,
  );
  const votesLeft = calculateVotesLeft(
    nominations,
    session?.user?.id,
    currentMonth,
  );

  function chooseSearchResult(movie: MovieSearchResultData) {
    setSelectedMovie(movie);
    setQuery("");
    setSearchResults([]);
  }

  const nominate: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (userHasNominatedThisMonth || !selectedMovie || isSubmitting) return;
    setMessage("");
    setIsSubmitting(true);
    try {
      const data = await api.nominations.create({
        tmdbId: selectedMovie.id,
        comment,
      });
      setNominations((prev) => new Map(prev).set(data.id, data));
      setComment("");
      setSelectedMovie(null);
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
            {userHasNominatedThisMonth
              ? "Rescind your nom"
              : "Choose your Fighter"}
          </button>
        </header>

        <AnimatePresence initial={false}>
          {isNominationOpen && (
            <NominationPanel
              nominatedThisMonth={userHasNominatedThisMonth}
              query={query}
              isSearching={isSearching}
              searchError={searchError}
              searchResults={searchResults}
              selectedMovie={selectedMovie}
              comment={comment}
              isSubmitting={isSubmitting}
              onClose={() => setIsNominationOpen(false)}
              onSubmit={nominate}
              onSelect={chooseSearchResult}
              onClearSelection={() => {
                setSelectedMovie(null);
                setQuery("");
                setComment("");
              }}
              onQueryChange={(value) => {
                setQuery(value);
                setSelectedMovie(null);
              }}
              onCommentChange={setComment}
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

const hasUserNominatedThisMonth = (
  nominations: Map<number, Nomination>,
  userId: string | undefined,
  month: number,
): boolean => false;
// !userId || some({nominator: {id: userId}, month})(nominations);

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
