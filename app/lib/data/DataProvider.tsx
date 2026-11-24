"use client";

import { authClient } from "@/lib/auth/client";
import type { Movie, Nomination } from "@/src/db/schema";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { ApiError, subscribeToMutations } from "../api";
import { useDevServiceWorkerReset } from "../useDevServiceWorkerReset";
import { createCacheProvider } from "./cache-provider";
import { some, set, matching, filter, not } from "shades";

interface DataSession {
  userId?: string;
  username?: string | null;
  isPending: boolean;
  error: { message?: string } | null;
  retry: () => unknown;
  cacheReady: boolean;
}

const SessionContext = createContext<DataSession | null>(null);
export function useDataSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Data hooks must be used inside DataProvider.");
  return session;
}

export const isAccessError = (error: unknown): error is ApiError =>
  error instanceof ApiError && [401, 403, 404].includes(error.status);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [cacheReady, setCacheReady] = useState(false);
  useDevServiceWorkerReset();

  // Wait for hydration before enabling queries that can read localStorage.
  // prevents accessing localStorage on the server
  useEffect(() => setCacheReady(true), []);

  return (
    <SessionContext.Provider
      value={{
        userId: session?.user.id,
        username: session?.user.username,
        isPending,
        error,
        retry: refetch,
        cacheReady,
      }}
    >
      <SessionCache
        key={`${session?.session.id ?? "anonymous"}:${cacheReady}`}
        userId={session?.user.id}
      >
        {children}
      </SessionCache>
    </SessionContext.Provider>
  );
}

function SessionCache({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: string;
}) {
  const config = useMemo(
    () => ({
      provider: () => createCacheProvider(userId),
      shouldRetryOnError: (error: Error) => !isAccessError(error),
      errorRetryCount: 2,
    }),
    [userId],
  );

  return (
    <SWRConfig value={config}>
      <CacheSync />
      {children}
    </SWRConfig>
  );
}

const isTheatreQuery = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith("/api/theatres");

// Matches nomination list keys such as `/api/theatres/123/nominations`.
const nominationsQueryPath = /^\/api\/theatres\/[^/?]+\/nominations$/;

const isNominationsQuery = (key: unknown): key is string =>
  typeof key === "string" && nominationsQueryPath.test(key);

const isTheatreIndexQuery = (key: unknown): key is string =>
  typeof key === "string" &&
  (key === "/api/theatres" || key.startsWith("/api/theatres?"));

const isNonNominationsTheatreQuery = (key: unknown): key is string =>
  isTheatreQuery(key) && !isNominationsQuery(key);

// Matches theatre detail paths such as `/api/theatres/123`, but not `/api/theatres/123/seen`.
const theatreDetailPath = /^\/api\/theatres\/[^/?]+$/;

const isTheatreDetailQuery = (key: unknown): key is string =>
  typeof key === "string" && theatreDetailPath.test(key);

const isQueryForTheatre =
  (path: string) =>
  (key: unknown): key is string =>
    typeof key === "string" && (key === path || key.startsWith(`${path}/`));

function refreshInBackground(refresh: Promise<unknown>, errorMessage: string) {
  void refresh.catch((error: unknown) => {
    console.error(errorMessage, error);
  });
}

function CacheSync() {
  const { cache, mutate } = useSWRConfig();
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    // Shared layouts stay mounted when navigating between a list and settings.
    void mutate((key) => isTheatreQuery(key) && !cache.get(key)?.isValidating);
  }, [pathname, cache, mutate]);

  useEffect(() => {
    const updateCachedMovie = async (movie: Movie) => {
      await mutate<Nomination[]>(
        (key) => {
          if (!isNominationsQuery(key)) return false;
          const data: unknown = cache.get(key)?.data;
          return Array.isArray(data) && some({ movieId: movie.id })(data);
        },
        (current) =>
          set(matching({ movieId: movie.id }), "movie")(movie)(current ?? []),
        { revalidate: false },
      );
    };

    const insertCachedNomination = async (
      path: string,
      nomination: Nomination,
    ) => {
      // An uncached list loads fresh, with this nomination, when it's opened.
      if (Array.isArray(cache.get(path)?.data)) {
        await mutate<Nomination[]>(
          path,
          (current) =>
            current && [
              nomination,
              ...filter(not({ id: nomination.id }))(current),
            ],
          { revalidate: false },
        );
      }
      refreshInBackground(
        mutate(isTheatreIndexQuery),
        "Unable to refresh theatre previews.",
      );
    };

    const refreshAffectedTheatreData = async (path: string, method: string) => {
      if (method === "DELETE" && isTheatreDetailQuery(path)) {
        await mutate(isQueryForTheatre(path), undefined, { revalidate: false });
      }
      // Seen status and membership changes can affect more than one theatre.
      refreshInBackground(
        mutate(isNonNominationsTheatreQuery),
        "Unable to refresh theatre data after a mutation.",
      );
      await mutate(isNominationsQuery);
    };

    return subscribeToMutations(async (path, method, update) => {
      if (update?.kind === "movie") return updateCachedMovie(update.movie);
      if (update?.kind === "nomination")
        return insertCachedNomination(path, update.nomination);
      return refreshAffectedTheatreData(path, method);
    });
  }, [cache, mutate]);
  return null;
}
