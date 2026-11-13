import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/src/db/client";
import { movies } from "@/src/db/schema";
import { imdbId } from "./box-office";
import { findMovieById } from "./movie-metadata";
import { getTrivia } from "./trivia";

const ratingsIds = z.object({
  raw: z.object({ ids: z.object({ imdb: imdbId.optional() }) }),
});

export async function refreshTrivia(movieId: number) {
  const movie = await findMovieById(movieId);
  if (!movie) throw new Error("That movie is no longer available.");
  const id =
    imdbId.safeParse(movie.details.imdb_id).data ??
    ratingsIds.safeParse(movie.ratings).data?.raw.ids.imdb;
  if (!id) throw new Error("This movie has no IMDb ID for trivia.");
  const trivia = await getTrivia(id);
  await getDb()
    .update(movies)
    .set({
      details: sql`${movies.details} || ${JSON.stringify({ trivia })}::jsonb`,
    })
    .where(eq(movies.id, movieId));
}

export async function enrichTrivia(movieId: number): Promise<void> {
  try {
    await refreshTrivia(movieId);
  } catch (error) {
    console.error(`Unable to load IMDb trivia for movie ${movieId}.`, error);
  }
}
