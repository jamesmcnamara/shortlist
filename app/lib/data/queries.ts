"use client";

import useSWR from "swr";
import { api } from "../api";
import { isAccessError, useDataSession } from "./DataProvider";

interface QueryOptions {
  requiresUser?: boolean;
}

function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  { requiresUser = true }: QueryOptions = {},
) {
  const { userId, cacheReady } = useDataSession();
  const query = useSWR<T, Error>(
    cacheReady && (userId || !requiresUser) ? key : null,
    fetcher,
  );
  return {
    data: isAccessError(query.error) ? undefined : query.data,
    error: query.error,
    isLoading: query.isLoading,
    retry: () => query.mutate(),
  };
}

export function useTheatres() {
  return useQuery("/api/theatres?previews=true", api.theatres.listWithPosters, {
    requiresUser: false,
  });
}

export function useTheatresForMovies(movieIds: number[]) {
  const ids = [...new Set(movieIds)].sort((a, b) => a - b);
  return useQuery(`/api/theatres?movieIds=${ids.join(",")}`, () =>
    api.theatres.listForMovies(ids),
  );
}

export function useTheatreDetail(theatreId: string) {
  return useQuery(
    `/api/theatres/${encodeURIComponent(theatreId)}`,
    () => api.theatre(theatreId).get(),
    { requiresUser: false },
  );
}

export function useNominations(theatreId: string) {
  return useQuery(
    `/api/theatres/${encodeURIComponent(theatreId)}/nominations`,
    () => api.theatre(theatreId).nominations.list(),
    { requiresUser: false },
  );
}

export function useNotificationSettings(theatreId: string) {
  return useQuery(
    `/api/theatres/${encodeURIComponent(theatreId)}/notifications`,
    () => api.theatre(theatreId).notifications.get(),
  );
}

export function usePublicTheatre(inviteCode: string) {
  return useQuery(
    `/api/join/${encodeURIComponent(inviteCode)}`,
    () => api.publicTheatre(inviteCode),
    { requiresUser: false },
  );
}
