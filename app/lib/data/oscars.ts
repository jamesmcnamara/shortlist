"use client";

import { Movie } from "@/src/db/schema";
import useSWR from "swr";

export interface OscarEntry {
  year: string;
  category: string;
  winner: boolean;
  major: boolean;
  name: string;
  detail?: string;
}

export interface OscarMovie {
  wins: number;
  nominations: number;
  entries: OscarEntry[];
}

export interface Oscars {
  updatedThrough: number;
  movies: Record<string, OscarMovie>;
}

export function useOscars() {
  return useSWR<Oscars>("/data/oscars.json", fetchOscars, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
}

interface OscarsData {
  awards?: OscarMovie;
  error?: Error;
}

export function useOscarsFor(movie: Movie): OscarsData {
  const { data, error } = useOscars();
  const imdbId = getImdbId(movie);
  if (!imdbId || !data || !data.movies[imdbId]) return { error };
  return { awards: data.movies[imdbId] as OscarMovie, error };
}

export const getImdbId = (movie: Movie) => {
  const detailsId = movie.details.imdb_id;
  if (detailsId && /^tt\d+$/.test(detailsId)) return detailsId;

  const raw = movie.ratings.raw as { ids?: { imdb?: unknown } };
  return typeof raw.ids?.imdb === "string" && /^tt\d+$/.test(raw.ids.imdb)
    ? raw.ids.imdb
    : null;
};

const fetchOscars = async (url: string): Promise<Oscars> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Oscar data returned ${response.status}.`);
  }
  return response.json();
};

export const compareOscarEntries = (left: OscarEntry, right: OscarEntry) =>
  oscarsCategoryRank(left) - oscarsCategoryRank(right) ||
  left.category.localeCompare(right.category) ||
  right.year.localeCompare(left.year) ||
  Number(right.winner) - Number(left.winner);

export const oscarsCategoryRank = (entry: OscarEntry) => {
  if (entry.category === "BEST PICTURE") return 0;
  if (entry.category.startsWith("DIRECTING")) return 1;
  return (entry.major ?? isMajorCategory(entry.category)) ? 2 : 3;
};

export const isMajorCategory = (category: string) =>
  category === "BEST PICTURE" ||
  category.startsWith("DIRECTING") ||
  /^(ACTOR|ACTRESS) IN A (LEADING|SUPPORTING) ROLE$/.test(category) ||
  category === "WRITING (Adapted Screenplay)" ||
  category === "WRITING (Original Screenplay)" ||
  category.startsWith("CINEMATOGRAPHY");
