"use client";

import { createContext, useContext, useMemo } from "react";
import {
  api,
  type RoomApi,
  type RoomDetail,
  type RoomSummary,
} from "@/app/lib/api";
import type { SafeRoom } from "@/lib/auth/require-room";
import type { Nomination, RoomRole } from "@/src/db/schema";
import {
  useNominations,
  useRoomDetail,
  useRooms,
} from "@/app/lib/data/queries";
import { DataBoundary } from "@/app/lib/data/DataBoundary";
import { isAccessError } from "@/app/lib/data/DataProvider";

interface RoomContextValue {
  room: SafeRoom;
  role: RoomRole;
  rooms: RoomSummary[];
  client: RoomApi;
  isAdmin: boolean;
  detail: RoomDetail;
  noms: Nomination[];
}

const RoomContext = createContext<RoomContextValue | null>(null);

interface RoomProviderProps {
  roomId: string;
  children: React.ReactNode;
}

export function RoomProvider({ roomId, children }: RoomProviderProps) {
  const { data: detail, ...detailQuery } = useRoomDetail({ id: roomId });
  const { data: rooms, ...roomsQuery } = useRooms();
  const { data: noms, ...nomQuery } = useNominations({ id: roomId });
  const client = useMemo(() => api.room(roomId), [roomId]);
  const value = useMemo<RoomContextValue | null>(() => {
    if (!detail || !rooms || !noms) return null;
    return {
      room: detail.room,
      role: detail.membership.role,
      rooms,
      client,
      isAdmin: detail.membership.role === "admin",
      detail,
      noms,
    };
  }, [detail, rooms, noms, client]);

  const queries = [detailQuery, roomsQuery, nomQuery];
  const errors = queries.map((query) => query.error);
  return (
    <DataBoundary
      pending={!value}
      error={errors.find(isAccessError) ?? errors.find(Boolean)}
      retry={() => Promise.all(queries.map((query) => query.retry()))}
    >
      <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
    </DataBoundary>
  );
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) {
    throw new Error("useRoom must be used inside a RoomProvider.");
  }
  return value;
}
