"use client";

import { compareHref } from "@/app/compare/metrics";
import type { AppMenuProps } from "@/app/components/AppMenu";
import { BulkMovieImport } from "@/app/components/BulkMovieImport";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import type { MovieImportResult } from "@/app/lib/bulk-movie-import";
import { useAPIActions } from "@/app/lib/useAPIActions";
import { useMovieDiscussionHistory } from "@/app/lib/useMovieDiscussionHistory";
import { applyView, ViewContext, ViewState } from "@/app/lib/view";
import type { Movie, Nomination } from "@/src/db/schema";
import classnames from "classnames";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { all, filter, find, get, map, some } from "shades";
import { when } from "../lib/utils";
import { MovieGrid } from "./MovieGrid";
import styles from "./Theatre.module.css";

interface TheatreProps {
  name: string;
  header?: AppMenuProps;
  isAdmin?: boolean;
  nominees: Nomination[];
  viewState: ViewState;
  setViewState: (next: ViewState) => void;
  viewContext: ViewContext;
  userId: string | undefined;
  api?: TheatreAPI;
}

export function Theatre({
  name,
  header,
  isAdmin = false,
  userId,
  api = READ_ONLY_API,
  viewState,
  setViewState,
  viewContext,
  nominees,
}: TheatreProps) {
  const isReadOnly = "isReadOnly" in api;
  const canEdit = when(!isReadOnly);
  const { focusedId, closeDiscussion, openDiscussion } =
    useMovieDiscussionHistory();
  const [isWatchedOpen, setIsWatchedOpen] = useState(false);
  // TMDB ids picked for comparison, or null when not picking.
  const [comparing, setComparing] = useState<number[] | null>(null);
  const router = useRouter();
  const isComparing = comparing !== null;

  const togglePick = (tmdbId: number) =>
    setComparing((current) =>
      !current
        ? [tmdbId]
        : current.includes(tmdbId)
          ? current.filter((id) => id !== tmdbId)
          : [...current, tmdbId],
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
    updateNomRec: {
      api: api.updateNomRec,
      action: "update your recommendation",
    },
    addNomCom: {
      api: api.addNomCom,
      action: "add your comment",
    },
    updateNomCom: {
      api: api.updateNomCom,
      action: "update your comment",
    },
    toggleCompleted: {
      api: api.toggleCompleted,
      action: "update the completed status",
    },
    refreshJustWatch: {
      api: api.refreshJustWatch,
      action: "refresh Just Watch data",
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

  const visibleIds = filter(Boolean)(
    get(all(), "movie", "tmdbId")(visible),
  ) as number[];

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
      <ShortlistHeader {...header} />

      <section
        className={styles.nominations}
        aria-labelledby="nominations-title"
      >
        <h1 id="nominations-title" className={styles.sectionHeader}>
          {name}
        </h1>

        <ViewControls
          state={viewState}
          onChange={setViewState}
          existing={existing}
          isSubmitting={isSubmitting}
          onNominate={canEdit(actions.nominate)}
        />

        {message && (
          <div className={styles.message} role="status">
            {message}
          </div>
        )}
        {visible.length === 0 && (
          <p className={styles.message} role="status">
            {nominees.length === 0
              ? `Nothing here yet.${isReadOnly ? "" : " Add the first movie."}`
              : "No movies match these filters."}
          </p>
        )}
        <MovieGrid nominees={visible}>
          {(nom, index) => (
            <MovieCard
              rank={index + 1}
              nomination={nom}
              hasSeen={some({ id: userId })(nom.seenBy)}
              isExpanded={focused === nom}
              showMeta={showMeta}
              {...cardProps(nom)}
            />
          )}
        </MovieGrid>
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
            <MovieGrid nominees={watched}>
              {(nom, index) => (
                <MovieCard
                  rank={index + 1}
                  nomination={nom}
                  hasSeen={some({ id: userId })(nom.seenBy)}
                  showMeta={true}
                  isExpanded={focused === nom}
                  isCompleted
                  {...cardProps(nom)}
                />
              )}
            </MovieGrid>
          )}
        </section>
      )}

      {!isReadOnly && (
        <div className={styles.bulkImport}>
          <BulkMovieImport
            onImport={api.importTitle}
            isDisabled={isSubmitting}
          />
        </div>
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
            <span aria-live="polite">{comparing.length} picked</span>
            <button
              type="button"
              className={styles.compareAll}
              onClick={() => setComparing(visibleIds)}
            >
              Select All
            </button>
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
            onUpdateComment={canEdit((comment: string) =>
              actions.updateNomRec(focused.id, comment),
            )}
            onAddNomCom={canEdit((comment: string) =>
              actions.addNomCom(focused.id, comment),
            )}
            onUpdateNomCom={canEdit(actions.updateNomCom)}
            onMarkWatched={canEdit(() =>
              actions.toggleWatched(focused.movieId),
            )}
            onRefreshJustWatch={canEdit(() =>
              api.refreshJustWatch(focused.movieId),
            )}
            onRefreshBoxOffice={canEdit(() =>
              api.refreshBoxOffice(focused.movieId),
            )}
            onDelete={when(isAdmin)(() => actions.delete(focused.id))}
            onToggleCompleted={when(isAdmin)(() => {
              actions.toggleCompleted(focused.id);
              closeDiscussion();
            })}
            onClose={closeDiscussion}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

export interface TheatreAPI {
  importTitle: (title: string) => Promise<MovieImportResult>;
  refreshJustWatch: (movieId: number) => Promise<void>;
  refreshBoxOffice: (movieId: number) => Promise<void>;
  delete: (nominationId: number) => Promise<void>;
  nominate: (candidate: Movie, comment: string) => Promise<void>;
  updateNomRec: (nominationId: number, comment: string) => Promise<void>;
  addNomCom: (nominationId: number, comment: string) => Promise<void>;
  updateNomCom: (nomcomId: number, comment: string) => Promise<void>;
  toggleWatched: (movieId: number) => Promise<void>;
  toggleCompleted: (nominationId: number) => Promise<void>;
}

interface ReadOnlyTheatreAPI extends TheatreAPI {
  isReadOnly: true;
}

const readOnly = () => Promise.reject(new Error("This theatre is read-only."));

const READ_ONLY_API: ReadOnlyTheatreAPI = {
  importTitle: readOnly,
  refreshJustWatch: readOnly,
  refreshBoxOffice: readOnly,
  delete: readOnly,
  nominate: readOnly,
  updateNomRec: readOnly,
  addNomCom: readOnly,
  updateNomCom: readOnly,
  toggleWatched: readOnly,
  toggleCompleted: readOnly,
  isReadOnly: true,
};
