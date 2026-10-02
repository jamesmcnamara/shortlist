"use client";

import { createContext, useContext, useMemo } from "react";
import { api, type RoomApi, type RoomSummary } from "@/app/lib/api";
import type { SafeRoom } from "@/lib/auth/require-room";
import type { RoomRole } from "@/src/db/schema";

interface RoomContextValue {
  room: SafeRoom;
  role: RoomRole;
  rooms: RoomSummary[];
  client: RoomApi;
  isAdmin: boolean;
}

const RoomContext = createContext<RoomContextValue | null>(null);

interface RoomProviderProps {
  room: SafeRoom;
  role: RoomRole;
  rooms: RoomSummary[];
  children: React.ReactNode;
}

export function RoomProvider({
  room,
  role,
  rooms,
  children,
}: RoomProviderProps) {
  const value = useMemo<RoomContextValue>(
    () => ({
      room,
      role,
      rooms,
      client: api.room(room.ownerId, room.slug),
      isAdmin: role === "admin",
    }),
    [room, role, rooms],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) {
    throw new Error("useRoom must be used inside a RoomProvider.");
  }
  return value;
}
