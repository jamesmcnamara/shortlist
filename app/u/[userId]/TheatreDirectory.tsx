"use client";

import Link from "next/link";
import { Fragment, useSyncExternalStore, type CSSProperties } from "react";
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

export function TheatreDirectory({
  theatres,
  initialSearch,
}: {
  theatres: TheatreSummaryWithPosterPreviews[];
  initialSearch: string;
}) {
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
        {theatres.length === 0 && (
          <li>
            <p>No theatres yet.</p>
          </li>
        )}
        {theatres.length > 0 && visible.length === 0 && (
          <li>
            <p>No matching theatres.</p>
            <button
              type="button"
              className={styles.clearFilters}
              onClick={() => change({ query: "", filters: [] })}
            >
              Clear search and filters
            </button>
          </li>
        )}
        {visible.map((theatre) => (
          <li key={theatre.id}>
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
                      <span className={styles.tag}>#{tag}</span>{" "}
                    </Fragment>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
