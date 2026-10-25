"use client";

import { compareHref } from "@/app/compare/metrics";
import type { AppMenuProps } from "@/app/components/AppMenu";
import { BulkMovieImport } from "@/app/components/BulkMovieImport";
import { CrossPost } from "@/app/components/CrossPost/CrossPost";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { PickerBar } from "@/app/components/PickerBar";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { ViewControls } from "@/app/components/ViewControls";
import type { MovieImportResult } from "@/app/lib/bulk-movie-import";
import { useAPIActions } from "@/app/lib/useAPIActions";
import { useClickOutside } from "@/app/lib/useClickOutside";
import { useConfetti } from "@/app/lib/useConfetti";
import { useMovieDiscussionHistory } from "@/app/lib/useMovieDiscussionHistory";
import { applyView, ViewContext, ViewState } from "@/app/lib/view";
import type { Movie, Nomination } from "@/src/db/schema";
import classnames from "classnames";
import { AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { all, filter, find, get, map, some } from "shades";
import { when } from "../lib/utils";
import { MovieGrid } from "./MovieGrid";
import styles from "./Theatre.module.css";

interface TheatreProps {
  theatreId?: string;
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
  theatreId,
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
  const canParticipate = !isReadOnly && Boolean(userId);
  const canCurate = canParticipate && isAdmin;
  const { focusedId, closeDiscussion, openDiscussion } =
    useMovieDiscussionHistory();
  const [isWatchedOpen, setIsWatchedOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  // TMDB ids picked for compare or other bulk actions, or null when not picking.
  const [picked, setPicked] = useState<number[] | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Snapshotted on open so the sheet keeps its films after selection ends.
  const [crossPosting, setCrossPosting] = useState<Nomination[] | null>(null);
  const [notice, setNotice] = useState("");
  const menuRef = useClickOutside<HTMLDivElement>(
    () => setIsMenuOpen(false),
    isMenuOpen,
  );
  const router = useRouter();
  const celebrate = useConfetti();
  const isPicking = picked !== null;

  const stopPicking = () => {
    setPicked(null);
    setIsMenuOpen(false);
  };

  const togglePick = (tmdbId: number) => {
    setNotice("");
    setPicked((current) =>
      !current
        ? [tmdbId]
        : current.includes(tmdbId)
          ? current.filter((id) => id !== tmdbId)
          : [...current, tmdbId],
    );
  };

  const cardProps = (nom: Nomination) => {
    const { tmdbId } = nom.movie;
    return {
      isSelected: picked && tmdbId ? picked.includes(tmdbId) : undefined,
      onClick: () => {
        if (!picked) openDiscussion(nom.id);
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

  const pickedNoms = nominees.filter(
    ({ movie }) => movie.tmdbId !== null && picked?.includes(movie.tmdbId),
  );

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
      onStart: () => {
        if (focused && !some({ id: userId })(focused.seenBy)) celebrate();
      },
      action: "update your watched status",
    },
    markWatched: {
      api: api.markWatched,
      onStart: () => {
        if (pickedNoms.some((nom) => !some({ id: userId })(nom.seenBy))) {
          celebrate();
        }
      },
      onSuccess: stopPicking,
      action: "mark those watched",
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
      onStart: () => {
        if (focused && !focused.completed) celebrate();
      },
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

  const additionalMenuItems = [
    {
      type: "button",
      onClick: () => setIsImportOpen(true),
      label: "Import Movies",
    } as const,
  ];

  return (
    <main
      className={classnames(styles.shell, {
        [styles.shellComparing]: isPicking,
      })}
    >
      <ShortlistHeader
        {...header}
        additionalMenuItems={canCurate ? additionalMenuItems : []}
      />

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
          onNominate={when(canCurate)(actions.nominate)}
        />

        {(message || notice) && (
          <div className={styles.message} role="status">
            {message || notice}
          </div>
        )}
        {visible.length === 0 && (
          <p className={styles.message} role="status">
            {nominees.length === 0
              ? `Nothing here yet.${canCurate ? " Add the first movie." : ""}`
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

      {canCurate && isImportOpen && (
        <div className={styles.bulkImport}>
          <BulkMovieImport
            onImport={api.importTitle}
            onClose={() => setIsImportOpen(false)}
            isDisabled={isSubmitting}
          />
        </div>
      )}

      <AnimatePresence>
        {picked && (
          <PickerBar
            picked={picked}
            theatreId={theatreId}
            canParticipate={canParticipate}
            isSubmitting={isSubmitting}
            isMenuOpen={isMenuOpen}
            setIsMenuOpen={setIsMenuOpen}
            menuRef={menuRef}
            onClickSelectAll={() => setPicked(visibleIds)}
            onClickCancel={stopPicking}
            onClickCompare={() => {
              if (picked.length >= 2) router.push(compareHref(picked));
            }}
            onClickMarkWatched={() =>
              actions.markWatched(map("movieId")(pickedNoms))
            }
            onClickCrossPost={() => {
              setIsMenuOpen(false);
              setCrossPosting(pickedNoms);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {crossPosting && theatreId && (
          <CrossPost
            films={crossPosting}
            theatreId={theatreId}
            onClose={() => setCrossPosting(null)}
            onPosted={({ films, lists }) => {
              stopPicking();
              setNotice(
                `Posted ${plural(films, "film")} to ${plural(lists, "list")}.`,
              );
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {focused && (
          <MovieDiscussion
            key={focused.id}
            nomination={focused}
            hasSeen={some({ id: userId })(focused.seenBy)}
            currentUserId={userId ?? null}
            onUpdateComment={when(
              canCurate && focused.userId === userId,
            )((comment: string) =>
              actions.updateNomRec(focused.id, comment),
            )}
            onAddNomCom={when(canParticipate)((comment: string) =>
              actions.addNomCom(focused.id, comment),
            )}
            onUpdateNomCom={when(canParticipate)(actions.updateNomCom)}
            onMarkWatched={when(canParticipate)(() =>
              actions.toggleWatched(focused.movieId),
            )}
            onRefreshJustWatch={when(canParticipate)(() =>
              api.refreshJustWatch(focused.movieId),
            )}
            onRefreshBoxOffice={when(canParticipate)(() =>
              api.refreshBoxOffice(focused.movieId),
            )}
            onDelete={when(canCurate)(() => actions.delete(focused.id))}
            onToggleCompleted={when(canCurate)(async () => {
              if (await actions.toggleCompleted(focused.id)) {
                closeDiscussion();
              }
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
  markWatched: (movieIds: number[]) => Promise<void>;
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
  markWatched: readOnly,
  toggleCompleted: readOnly,
  isReadOnly: true,
};

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;
