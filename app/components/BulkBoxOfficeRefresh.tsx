"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api, ApiError } from "@/app/lib/api";
import { HEAT_STOPS } from "@/app/lib/heat";
import styles from "./BulkBoxOfficeRefresh.module.css";

interface Progress {
  completed: number;
  total: number | null;
  failed: number;
  running: boolean;
  error: string;
}

const INITIAL: Progress = {
  completed: 0,
  total: null,
  failed: 0,
  running: false,
  error: "",
};

export function BulkBoxOfficeRefresh({
  theatreId,
  onStart,
  buttonClassName,
}: {
  theatreId: string;
  onStart: () => void;
  buttonClassName: string;
}) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(INITIAL);
  const controller = useRef<AbortController | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => () => controller.current?.abort(), []);

  async function start() {
    setVisible(true);
    onStart();
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    const client = api.theatre(theatreId);
    setProgress({ ...INITIAL, running: true });
    try {
      const nominations = await client.nominations.list(current.signal);
      const ids = [...new Set(nominations.map(({ movieId }) => movieId))];
      if (current.signal.aborted) return;
      setProgress((state) => ({ ...state, total: ids.length }));

      for (const id of ids) {
        if (current.signal.aborted) break;
        try {
          await client.refreshBoxOffice(id, current.signal);
        } catch (error) {
          if (current.signal.aborted) break;
          setProgress((state) => ({ ...state, failed: state.failed + 1 }));
          if (
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          ) {
            throw error;
          }
        }
        if (!current.signal.aborted) {
          setProgress((state) => ({
            ...state,
            completed: state.completed + 1,
          }));
        }
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setProgress((state) => ({
          ...state,
          error:
            error instanceof Error
              ? error.message
              : "Couldn't refresh box office data. Try again.",
        }));
      }
    } finally {
      if (!current.signal.aborted) {
        setProgress((state) => ({ ...state, running: false }));
      }
      controller.current = null;
    }
  }

  const percent =
    progress.total === null
      ? 0
      : progress.total === 0
        ? 100
        : Math.floor((progress.completed / progress.total) * 100);
  const label = progress.running
    ? `Refreshing Box Office Mojo: ${progress.completed} of ${progress.total ?? "unknown"} movies checked`
    : progress.total === 0
      ? "No movies to refresh."
      : `Box Office Mojo: ${progress.completed} movies checked, ${progress.failed} failed`;

  return (
    <>
      <button type="button" className={buttonClassName} onClick={start}>
        {progress.running ? "Show box office progress" : "Refresh box office"}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                className={styles.drawer}
                role="region"
                aria-label="Box office refresh"
                initial={reducedMotion ? false : { y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
              >
                <div
                  className={styles.track}
                  role="progressbar"
                  aria-label="Refreshing Box Office Mojo"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress.total === null ? undefined : percent}
                  aria-valuetext={label}
                >
                  <motion.div
                    className={styles.fill}
                    style={{
                      background: HEAT_STOPS[8],
                      transformOrigin: "left",
                    }}
                    initial={false}
                    animate={{ scaleX: percent / 100 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.2,
                      ease: "easeOut",
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={styles.dismiss}
                  aria-label="Dismiss box office progress"
                  onClick={() => setVisible(false)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
                <p className="srOnly" role="status">
                  {label}
                </p>
                {(progress.error ||
                  progress.failed > 0 ||
                  progress.total === 0) && (
                  <p
                    className={styles.message}
                    role={
                      progress.error || progress.failed ? "alert" : "status"
                    }
                  >
                    {progress.error ||
                      (progress.total === 0
                        ? "No movies to refresh."
                        : `${progress.failed} ${progress.failed === 1 ? "movie couldn't" : "movies couldn't"} be refreshed. Retry from the menu.`)}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
