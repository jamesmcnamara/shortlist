"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { SWRConfig, useSWRConfig } from "swr";
import { authClient } from "@/lib/auth/client";
import { ApiError, subscribeToMutations } from "../api";
import { createCacheProvider } from "./cache-provider";

interface DataSession {
  userId?: string;
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

  // Wait for hydration before enabling queries that can read localStorage.
  // prevents accessing localStorage on the server
  useEffect(() => setCacheReady(true), []);

  return (
    <SessionContext.Provider
      value={{
        userId: session?.user.id,
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

const isRoomQuery = (key: unknown): key is string =>
  typeof key === "string" && key.startsWith("/api/rooms");

function CacheSync() {
  const { cache, mutate } = useSWRConfig();
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    // Shared layouts stay mounted when navigating between a list and settings.
    void mutate((key) => isRoomQuery(key) && !cache.get(key)?.isValidating);
  }, [pathname, cache, mutate]);

  useEffect(
    () =>
      subscribeToMutations(async (path, method) => {
        if (method === "DELETE" && /^\/api\/rooms\/[^/?]+$/.test(path)) {
          await mutate(
            (key) =>
              typeof key === "string" &&
              (key === path || key.startsWith(`${path}/`)),
            undefined,
            { revalidate: false },
          );
        }
        // Seen status and membership changes can affect more than one room.
        await mutate(isRoomQuery);
      }),
    [mutate],
  );
  return null;
}
