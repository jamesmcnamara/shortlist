import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import type { Movie } from "@/src/db/schema";
import type { JustWatchAvailability } from "./justwatch-types";
import { map, matching, mod, filter, set, updateAll } from "shades";

interface Row {
  id: number;
  title: string;
  status: "pending" | "updated" | "not_found" | "failed";
  error?: string;
}

export interface JustWatchAPI {
  rows: Row[];
  isRunning: boolean;
  isStopping: boolean;
  start: () => Promise<void>;
  resume: () => Promise<void>;
  retry: () => Promise<void>;
  stop: () => void;
}

export function useBulkJustWatch(
  roomId: string,
  movies: Movie[],
  refresh: (movieId: number) => Promise<JustWatchAvailability>,
): JustWatchAPI {
  const [rows, setRows] = useState<Row[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const running = useRef(false);
  const stop = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    setRows([]);
    setIsRunning(false);
    setIsStopping(false);
    running.current = false;
    return () => {
      generation.current += 1;
      stop.current = true;
    };
  }, [roomId]);

  async function run(queue: Row[], selectedIds?: Set<number>) {
    if (running.current) return;
    const currentGeneration = generation.current;
    const active = () => generation.current === currentGeneration;
    running.current = true;
    stop.current = false;
    setRows(queue);
    setIsRunning(true);
    setIsStopping(false);
    try {
      for (const row of queue) {
        if (stop.current || !active()) break;
        if (row.status !== "pending") continue;
        if (selectedIds && !selectedIds.has(row.id)) continue;
        let result: Row;
        try {
          const availability = await refresh(row.id);
          if (availability.status === "unavailable") {
            throw new Error("JustWatch is temporarily unavailable. Try again.");
          }
          result = {
            ...row,
            status: availability.status === "matched" ? "updated" : "not_found",
          };
        } catch (error) {
          result = {
            ...row,
            status: "failed",
            error:
              error instanceof Error
                ? error.message
                : "Unable to load JustWatch.",
          };
          if (
            error instanceof ApiError &&
            [401, 403, 404].includes(error.status)
          ) {
            stop.current = true;
          }
        }
        if (!active()) break;
        setRows((current) =>
          current.map((item) => (item.id === row.id ? result : item)),
        );
      }
    } finally {
      if (active()) {
        running.current = false;
        setIsRunning(false);
        setIsStopping(false);
      }
    }
  }

  return {
    rows,
    isRunning,
    isStopping,
    start: () =>
      run(
        movies
          .filter(
            (movie, index, all) =>
              all.findIndex((item) => item.id === movie.id) === index,
          )
          .map((movie) => ({
            id: movie.id,
            title: movie.details.title,
            status: "pending",
          })),
      ),
    resume: () => run(rows),
    retry: () =>
      run(
        mod(matching({ status: "failed" }))(
          updateAll<Row>(
            set("status")("pending"),
            set("error")(undefined as string | undefined),
          ),
        )(rows),
        new Set(map("id")(filter({ status: "failed" })(rows))),
      ),
    stop: () => {
      stop.current = true;
      setIsStopping(true);
    },
  };
}
