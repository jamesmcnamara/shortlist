"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "@/app/lib/api";
import {
  parseMovieTitles,
  type MovieImportResult,
} from "@/app/lib/bulk-movie-import";
import styles from "./BulkMovieImport.module.css";

type Row = { title: string } & (
    | MovieImportResult
    | { status: "pending" }
    | { status: "failed"; error: string }
  );

interface BulkMovieImportProps {
  onImport: (title: string) => Promise<MovieImportResult>;
  isDisabled?: boolean;
}

export function BulkMovieImport({
  onImport,
  isDisabled = false,
}: BulkMovieImportProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [blockingError, setBlockingError] = useState("");
  const running = useRef(false);
  const stop = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);

  const titles = parseMovieTitles(input);
  const finished = rows.filter((row) => row.status !== "pending").length;
  const added = rows.filter((row) => row.status === "added").length;
  const pending = rows.some((row) => row.status === "pending");
  const failed = rows.some((row) => row.status === "failed");

  async function run(nextRows: Row[], retry = false) {
    if (running.current || isDisabled) return;
    running.current = true;
    stop.current = false;
    setIsRunning(true);
    setIsStopping(false);
    setBlockingError("");
    const selectedTitles = new Set(
      nextRows
        .filter((row) =>
          retry ? row.status === "failed" : row.status === "pending",
        )
        .map((row) => row.title),
    );
    const queue = nextRows.map((row): Row =>
      retry && row.status === "failed"
        ? { title: row.title, status: "pending" }
        : row,
    );
    setRows(queue);

    try {
      for (const row of queue) {
        if (stop.current || !mounted.current) break;
        if (!selectedTitles.has(row.title)) continue;
        let result: Row;
        try {
          result = { title: row.title, ...(await onImport(row.title)) };
        } catch (error) {
          result = {
            title: row.title,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Unable to import this movie. Try again.",
          };
          if (
            error instanceof ApiError &&
            [401, 403, 404, 503].includes(error.status)
          ) {
            stop.current = true;
            if (mounted.current) setBlockingError(error.message);
          }
        }
        if (!mounted.current) break;
        setRows((current) =>
          current.map((item) => (item.title === row.title ? result : item)),
        );
      }
    } finally {
      running.current = false;
      if (mounted.current) {
        setIsRunning(false);
        setIsStopping(false);
      }
    }
  }

  return (
    <div className={styles.import}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
        disabled={isRunning}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? "Close import" : "Import movies"}
      </button>
      {isOpen && (
        <section
          id={`${id}-panel`}
          className={styles.panel}
          aria-labelledby={`${id}-label`}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (titles.length > 0) {
                void run(titles.map((title) => ({ title, status: "pending" })));
              }
            }}
          >
            <label id={`${id}-label`} htmlFor={`${id}-titles`}>
              Movie titles
            </label>
            <p id={`${id}-hint`} className={styles.hint}>
              One title per line. We'll add the first TMDB match automatically
              and skip movies already on this list, including Watched.
            </p>
            <textarea
              id={`${id}-titles`}
              aria-describedby={`${id}-hint`}
              rows={6}
              placeholder={"The Matrix\nSpirited Away\nArrival"}
              value={input}
              disabled={isRunning}
              onChange={(event) => {
                setInput(event.target.value);
                setRows([]);
                setBlockingError("");
              }}
            />
            <div className={styles.actions}>
              <button
                className={styles.submit}
                type="submit"
                disabled={isRunning || isDisabled || titles.length === 0}
              >
                {titles.length === 0
                  ? "Import movies"
                  : `Import ${titles.length} ${titles.length === 1 ? "movie" : "movies"}`}
              </button>
              {isRunning && (
                <button
                  type="button"
                  disabled={isStopping}
                  onClick={() => {
                    stop.current = true;
                    setIsStopping(true);
                  }}
                >
                  {isStopping ? "Stopping..." : "Stop"}
                </button>
              )}
              {!isRunning && pending && (
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => void run(rows)}
                >
                  Continue import
                </button>
              )}
              {!isRunning && failed && (
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => void run(rows, true)}
                >
                  Retry failed titles
                </button>
              )}
            </div>
          </form>
          {rows.length > 0 && (
            <>
              <p role="status" className={styles.summary}>
                {isRunning
                  ? `${isStopping ? "Stopping after this movie." : "Importing."} ${finished} of ${rows.length} processed.`
                  : `${pending || blockingError ? "Import stopped." : "Import complete."} ${finished} of ${rows.length} processed.`}
                {" "}{added} added.
              </p>
              {blockingError && (
                <p role="alert" className={styles.error}>
                  {blockingError} Import stopped.
                </p>
              )}
              <ul
                className={styles.results}
                aria-label="Import results"
                tabIndex={0}
              >
                {rows.map((row) => (
                  <li key={row.title}>
                    <strong>{row.title}</strong>
                    {"movie" in row && (
                      <span>
                        Matched: {row.movie.title}
                        {row.movie.year ? ` (${row.movie.year})` : ""}
                      </span>
                    )}
                    <span className={row.status === "failed" ? styles.error : ""}>
                      {row.status === "pending"
                        ? "Not processed yet"
                        : row.status === "added"
                          ? "Added"
                          : row.status === "already_on_list"
                            ? "Already on this list - skipped"
                            : row.status === "not_found"
                              ? "No match found - skipped"
                              : row.error}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
