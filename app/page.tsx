"use client";

import { redirect } from "next/navigation";
import { MovieSearch } from "@/app/components/MovieSearch";
import { useTheatres } from "@/app/lib/data/queries";
import { DataBoundary } from "@/app/lib/data/DataBoundary";

/**
 * Search is the landing surface: finding something to watch is the thing
 * people open the app to do. Theatres live at /theatres.
 */
export default function Home() {
  const { data: theatres, error, retry } = useTheatres();
  if (theatres?.length === 0 && !error) redirect("/theatres/new");

  return (
    <DataBoundary pending={!theatres} error={error} retry={retry}>
      <MovieSearch />
    </DataBoundary>
  );
}
