import { and, eq, exists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import { getWikipediaUrl } from "./wikipedia";

const detailsSchema = z.object({ imdb_id: z.string().nullish() });

export async function refreshWikipedia(movieId: number, theatreId?: string) {
  const db = getDb();
  const belongsToTheatre =
    theatreId === undefined
      ? undefined
      : exists(
          db
            .select({ id: nominations.id })
            .from(nominations)
            .where(
              and(
                eq(nominations.theatreId, theatreId),
                eq(nominations.movieId, movies.id),
              ),
            ),
        );
  const condition = and(eq(movies.id, movieId), belongsToTheatre);
  const [movie] = await db
    .select({ tmdbId: movies.tmdbId, details: movies.details })
    .from(movies)
    .where(condition)
    .limit(1);
  if (!movie) return { status: "not_found" } as const;
  if (movie.tmdbId === null) return { status: "missing_tmdb" } as const;

  let wikipediaUrl: string | null;
  try {
    const { imdb_id } = detailsSchema.parse(movie.details);
    wikipediaUrl =
      (await getWikipediaUrl(movie.tmdbId, imdb_id ?? undefined)) ?? null;
  } catch (error) {
    console.error("Unable to load Wikipedia article.", error);
    return { status: "lookup_failed" } as const;
  }

  const [updated] = await db
    .update(movies)
    .set({
      // Merge only this key so concurrent metadata edits are preserved.
      details: sql`jsonb_set(${movies.details}, '{wikipediaUrl}', ${JSON.stringify(wikipediaUrl)}::jsonb)`,
    })
    .where(condition)
    .returning({ id: movies.id });
  return updated
    ? ({ status: "updated", wikipediaUrl } as const)
    : ({ status: "removed" } as const);
}
