"use client";

import Link from "next/link";
import {
  forwardRef,
  Fragment,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { CollectionViewControls } from "@/app/components/CollectionViewControls";
import type { TheatreSummaryWithPosterPreviews } from "@/app/lib/api";
import {
  applyTheatreView,
  parseTheatreView,
  theatreViewParams,
  THEATRE_SORTS,
  type TheatreViewState,
} from "@/app/lib/theatre-view";
import { theatrePath } from "@/lib/theatre-path";
import styles from "./page.module.css";
import { stopPropagation } from "@/app/lib/utils";

const VIEW_CHANGE = "theatre-view-change";
const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange);
  window.addEventListener(VIEW_CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(VIEW_CHANGE, onChange);
  };
};

const getSearch = () => window.location.search;

interface TheatreDirectoryProps {
  theatres: TheatreSummaryWithPosterPreviews[];
  initialSearch: string;
}

export function TheatreDirectory({
  theatres,
  initialSearch,
}: TheatreDirectoryProps) {
  const search = useSyncExternalStore(
    subscribe,
    getSearch,
    () => initialSearch,
  );
  const state = parseTheatreView(new URLSearchParams(search));
  const change = (patch: Partial<TheatreViewState>) => {
    const current = new URLSearchParams(window.location.search);
    const params = theatreViewParams(current, {
      ...parseTheatreView(current),
      ...patch,
    });
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    window.dispatchEvent(new Event(VIEW_CHANGE));
  };
  const visible = applyTheatreView(theatres, state);
  const reducedMotion = useReducedMotion();
  const tags = [
    ...new Set([
      ...theatres.flatMap((theatre) => theatre.tags),
      ...state.filters,
    ]),
  ].sort();

  return (
    <>
      <CollectionViewControls
        state={state}
        onChange={change}
        sorts={THEATRE_SORTS}
        filters={tags.map((tag) => ({ id: tag, label: `#${tag}` }))}
        emptyFilters="No tags yet."
        search={{
          query: state.query,
          onChange: (query) => change({ query }),
          label: "Search theatres",
          placeholder: "Search theatres...",
        }}
      />
      <span className={styles.resultCount} role="status">
        {visible.length} {visible.length === 1 ? "theatre" : "theatres"}
      </span>
      <ul className={styles.list}>
        <AnimatePresence initial={false} mode="popLayout">
          {theatres.length === 0 && (
            <TheatreListItem key="empty" reducedMotion={reducedMotion}>
              <p>No theatres yet.</p>
            </TheatreListItem>
          )}
          {theatres.length > 0 && visible.length === 0 && (
            <TheatreListItem key="no-matches" reducedMotion={reducedMotion}>
              <p>No matching theatres.</p>
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => change({ query: "", filters: [] })}
              >
                Clear search and filters
              </button>
            </TheatreListItem>
          )}
          {visible.map((theatre) => (
            <TheatreListItem key={theatre.id} reducedMotion={reducedMotion}>
              <Link
                className={styles.theatreCard}
                href={theatrePath(theatre)}
                prefetch
              >
                <span className={styles.theatreName}>{theatre.name}</span>
                {theatre.posterUrls.length > 0 && (
                  <span className={styles.posters} aria-hidden="true">
                    {theatre.posterUrls.map((posterUrl, i) => (
                      <img
                        className={styles.poster}
                        key={posterUrl}
                        style={{ "--i": i } as CSSProperties}
                        src={posterUrl}
                        alt=""
                        width="72"
                        height="108"
                        loading="lazy"
                      />
                    ))}
                  </span>
                )}
                {theatre.tags.length > 0 && (
                  <span className={styles.tags}>
                    {theatre.tags.toSorted().map((tag) => (
                      <Fragment key={tag}>
                        <span
                          onClick={stopPropagation({
                            callback: () => change({ filters: [tag] }),
                            preventDefault: true,
                          })}
                          className={styles.tag}
                        >
                          #{tag}
                        </span>{" "}
                      </Fragment>
                    ))}
                  </span>
                )}
              </Link>
            </TheatreListItem>
          ))}
        </AnimatePresence>
      </ul>
    </>
  );
}

const TheatreListItem = forwardRef<
  HTMLLIElement,
  {
    children: ReactNode;
    reducedMotion: boolean | null;
  }
>(function TheatreListItem({ children, reducedMotion }, ref) {
  const present = useIsPresent();
  const spatialState = reducedMotion
    ? { opacity: 0.7 }
    : { opacity: 0, scale: 0.975, filter: "blur(2px)" };

  return (
    <motion.li
      ref={ref}
      inert={!present}
      layout={reducedMotion ? false : "position"}
      initial={spatialState}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      exit={spatialState}
      transition={{
        layout: { type: "spring", stiffness: 380, damping: 38 },
        opacity: { duration: reducedMotion ? 0.1 : 0.16 },
        scale: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
        filter: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
      }}
    >
      {children}
    </motion.li>
  );
});
