"use client";

import { useEffect, useRef, useState } from "react";
import { set, mod, inc } from "shades";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { api, ApiError } from "@/app/lib/api";
import { HEAT_STOPS } from "@/app/lib/heat";
import styles from "./BulkMovieRefresh.module.css";
import { when } from "../lib/utils";

interface BulkMovieService {
  name: string;
  label: string;
  refresh(id: number, signal: AbortSignal): Promise<unknown>;
}

interface Progress {
  completed: number;
  total?: number;
  failed: number;
  running: boolean;
  error: string;
}

const INITIAL: Progress = {
  completed: 0,
  failed: 0,
  running: false,
  error: "",
};

interface BulkMovieRefreshProps {
  theatreId: string;
  service: BulkMovieService;
  onStart: () => void;
  buttonClassName: string;
}

export function BulkMovieRefresh({
  theatreId,
  service: { name, label, refresh },
  onStart,
  buttonClassName,
}: BulkMovieRefreshProps) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(INITIAL);
  const controller = useRef<AbortController | null>(null);
  const reducedMotion = useReducedMotion();

  async function refreshMovie(id: number, signal: AbortSignal) {
    try {
      await refresh(id, signal);
    } catch (error) {
      setProgress(mod("failed")(inc));
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
        throw error;
      }
    }
  }

  useEffect(() => () => controller.current?.abort(), []);

  async function start() {
    setVisible(true);
    onStart();
    if (controller.current) return;
    const current = new AbortController();
    controller.current = current;
    const client = api.theatre(theatreId);
    setProgress(set("running")(true)(INITIAL));
    try {
      const nominations = await client.nominations.list(current.signal);
      const ids = [...new Set(nominations.map(({ movieId }) => movieId))];
      if (current.signal.aborted) return;
      setProgress(set("total")(ids.length));

      for (const id of ids) {
        if (current.signal.aborted) break;
        await refreshMovie(id, current.signal);
        if (current.signal.aborted) return;
        setProgress(mod("completed")(inc));
      }
    } catch (error) {
      if (!current.signal.aborted) {
        setProgress(
          set("error")(
            error instanceof Error
              ? error.message
              : `Couldn't refresh ${label} data. Try again.`,
          ),
        );
      }
    } finally {
      if (!current.signal.aborted) {
        setProgress(set("running")(false));
      }
      controller.current = null;
    }
  }

  const progressText = getProgressText(progress, name);

  return (
    <>
      <button type="button" className={buttonClassName} onClick={start}>
        {progress.running ? `Show ${label} progress` : `Refresh ${label}`}
      </button>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {visible && (
              <motion.div
                className={styles.drawer}
                role="region"
                aria-label={`${name} refresh`}
                initial={reducedMotion ? false : { y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
              >
                <div
                  className={styles.track}
                  role="progressbar"
                  aria-label={`Refreshing ${name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressText.percent}
                  aria-valuetext={progressText.label}
                >
                  <motion.div
                    className={styles.fill}
                    style={{
                      background: HEAT_STOPS[8],
                      transformOrigin: "left",
                    }}
                    initial={false}
                    animate={{ scaleX: progressText.percent / 100 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.2,
                      ease: "easeOut",
                    }}
                  />
                </div>
                <button
                  type="button"
                  className={styles.dismiss}
                  aria-label={`Dismiss ${label} progress`}
                  onClick={() => setVisible(false)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
                <p className="srOnly" role="status">
                  {progressText.label}
                </p>
                {progressText.status && (
                  <p className={styles.message} role={progressText.role}>
                    {progressText.status}
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

interface ProgressText {
  role: string;
  label: string;
  percent: number;
  status?: string;
}

const getProgressText = (progress: Progress, name: string): ProgressText => ({
  role: getProgressRole(progress),
  label: getProgressLabel(progress, name),
  percent: getProgressPercent(progress),
  status: when(progress.error || progress.failed > 0 || progress.total === 0)(
    getProgressStatus(progress),
  ),
});

const getProgressRole = (progress: Progress): string => {
  if (progress.error || progress.failed > 0) return "alert";
  return "status";
};

const getProgressPercent = (progress: Progress): number =>
  progress.total === undefined
    ? 0
    : progress.total === 0
      ? 100
      : Math.floor((progress.completed / progress.total) * 100);

const getProgressStatus = (progress: Progress): string => {
  switch (true) {
    case !!progress.error:
      return progress.error;
    case progress.total === 0:
      return "No movies to refresh.";
    case progress.failed > 0:
      return `${progress.failed} ${progress.failed === 1 ? "movie couldn't" : "movies couldn't"} be refreshed. Retry from the menu.`;
    default:
      return "Refreshing movies...";
  }
};

const getProgressLabel = (progress: Progress, name: string) =>
  progress.running
    ? `Refreshing ${name}: ${progress.completed} of ${progress.total ?? "unknown"} movies checked`
    : progress.total === 0
      ? "No movies to refresh."
      : `${name}: ${progress.completed} movies checked, ${progress.failed} failed`;
