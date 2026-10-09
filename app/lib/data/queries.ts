"use client";

import useSWR from "swr";
import { api } from "../api";
import { isAccessError, useDataSession } from "./DataProvider";

function useQuery<T>(key: string, fetcher: () => Promise<T>) {
  const { userId, cacheReady } = useDataSession();
  const query = useSWR<T, Error>(userId && cacheReady ? key : null, fetcher);
  return {
    data: isAccessError(query.error) ? undefined : query.data,
    error: query.error,
    isLoading: query.isLoading,
    retry: () => query.mutate(),
  };
}

export function useRooms() {
  return useQuery("/api/rooms?previews=true", api.rooms.listWithPosters);
}

export function useRoomsForMovie(movieId: number) {
  return useQuery(`/api/rooms?movieId=${movieId}`, () =>
    api.rooms.listForMovie(movieId),
  );
}

interface RoomReference {
  id: string;
}

export function useRoomDetail(room: RoomReference) {
  return useQuery(
    `/api/rooms/${encodeURIComponent(room.id)}`,
    () => api.room(room.id).get(),
  );
}

export function useNominations(room: RoomReference) {
  return useQuery(
    `/api/rooms/${encodeURIComponent(room.id)}/nominations`,
    () => api.room(room.id).nominations.list(),
  );
}
