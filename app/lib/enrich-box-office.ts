import { and, eq, exists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import { getBoxOffice, imdbId } from "./box-office";

const detailsIds = z.object({ imdb_id: z.unknown().optional() });
const ratingsIds = z.object({
  raw: z.object({ ids: z.object({ imdb: z.unknown().optional() }) }),
});
const tmdbBudget = z.object({
  budget: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export async function refreshBoxOffice(movieId: number, theatreId?: string) {
  const db = getDb();
  const inTheatre =
    theatreId === undefined
      ? undefined
      : exists(
          db
            .select({ id: nominations.id })
            .from(nominations)
            .where(
              and(
                eq(nominations.movieId, movies.id),
                eq(nominations.theatreId, theatreId),
              ),
            ),
        );
  const condition = and(eq(movies.id, movieId), inTheatre);
  const [movie] = await db
    .select({ details: movies.details, ratings: movies.ratings })
    .from(movies)
    .where(condition)
    .limit(1);
  if (!movie) return { status: "not_found" } as const;

  const id = [
    detailsIds.safeParse(movie.details).data?.imdb_id,
    ratingsIds.safeParse(movie.ratings).data?.raw.ids.imdb,
  ]
    .map((value) => imdbId.safeParse(value).data)
    .find((value) => value !== undefined);
  if (!id) return { status: "missing_imdb" } as const;

  const mojo = await getBoxOffice(id);
  const boxOffice = {
    ...mojo,
    budget:
      mojo.budget ?? tmdbBudget.safeParse(movie.details).data?.budget ?? null,
  };
  const [updated] = await db
    .update(movies)
    .set({
      // Merge just this key so concurrent streaming/metadata edits survive.
      details: sql`jsonb_set(${movies.details}, '{boxOffice}', ${JSON.stringify(boxOffice)}::jsonb)`,
    })
    .where(condition)
    .returning({ id: movies.id });
  return updated
    ? ({ status: "updated", boxOffice } as const)
    : ({ status: "not_found" } as const);
}

export async function enrichBoxOffice(movieId: number): Promise<void> {
  try {
    const result = await refreshBoxOffice(movieId);
    if (result.status !== "updated") {
      console.warn(
        `Skipping Box Office Mojo for movie ${movieId}: ${result.status}.`,
      );
    }
  } catch (error) {
    console.error(
      `Unable to load Box Office Mojo for movie ${movieId}.`,
      error,
    );
  }
}
