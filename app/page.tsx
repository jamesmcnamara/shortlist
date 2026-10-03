"use client";

import { redirect } from "next/navigation";
import { MovieSearch } from "@/app/components/MovieSearch";
import { useRooms } from "@/app/lib/data/queries";
import { DataBoundary } from "@/app/lib/data/DataBoundary";

/**
 * Search is the landing surface: finding something to watch is the thing
 * people open the app to do. Rooms live at /rooms.
 */
export default function Home() {
  const { data: rooms, error, retry } = useRooms();
  if (rooms?.length === 0 && !error) redirect("/rooms/new");

  return (
    <DataBoundary pending={!rooms} error={error} retry={retry}>
      <MovieSearch />
    </DataBoundary>
  );
}
