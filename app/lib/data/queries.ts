"use client";

import useSWR from "swr";
import { api } from "../api";
import { roomApiKey } from "@/lib/room-path";
import { isAccessError, useDataSession } from "./DataProvider";

function useQuery<T>(key: string, fetcher: () => Promise<T>) {
  const { userId } = useDataSession();
  const query = useSWR<T, Error>(userId ? key : null, fetcher);
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

interface RoomPath {
  ownerId: string;
  slug: string;
}

export function useRoomDetail(room: RoomPath) {
  return useQuery(
    `/api/rooms/${encodeURIComponent(roomApiKey(room))}`,
    () => api.room(room.ownerId, room.slug).get(),
  );
}

export function useNominations(room: RoomPath) {
  return useQuery(
    `/api/rooms/${encodeURIComponent(roomApiKey(room))}/nominations`,
    () => api.room(room.ownerId, room.slug).nominations.list(),
  );
}
