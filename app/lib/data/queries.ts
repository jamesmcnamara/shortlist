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
  return useQuery("/api/theatres?previews=true", api.theatres.listWithPosters);
}

export function useTheatresForMovie(movieId: number) {
  return useQuery(`/api/theatres?movieId=${movieId}`, () =>
    api.theatres.listForMovie(movieId),
  );
}

interface TheatreReference {
  id: string;
}

export function useTheatreDetail(theatre: TheatreReference) {
  return useQuery(`/api/theatres/${encodeURIComponent(theatre.id)}`, () =>
    api.theatre(theatre.id).get(),
  );
}

export function useNominations(theatre: TheatreReference) {
  return useQuery(
    `/api/theatres/${encodeURIComponent(theatre.id)}/nominations`,
    () => api.theatre(theatre.id).nominations.list(),
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
