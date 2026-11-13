import { eq, sql } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { movies, type Movie } from "@/src/db/schema";
import { refreshBoxOffice } from "./enrich-box-office";
import { refreshTrivia } from "./enrich-trivia";
import { refreshWikipedia } from "./enrich-wikipedia";
import * as justwatch from "./justwatch";
import {
  findMovieById,
  refreshRatings,
  refreshTmdbMetadata,
} from "./movie-metadata";

export interface MovieRefreshResult {
  movie: Movie;
  failed: string[];
}

export async function refreshMovie(movie: Movie): Promise<MovieRefreshResult> {
  const attempt = async (name: string, refresh: () => Promise<unknown>) => {
    try {
      await refresh();
      return [];
    } catch (error) {
      console.error(`Unable to refresh ${name} for movie ${movie.id}.`, error);
      return [name];
    }
  };
  const metadataFailures = await Promise.all([
    attempt("TMDB", () => refreshTmdbMetadata(movie)),
    attempt("MDBList", () => refreshRatings(movie)),
  ]);
  const current = await findMovieById(movie.id);
  if (!current) throw new Error("That movie is no longer available.");

  const integrationFailures = await Promise.all([
    attempt("JustWatch", async () => {
      if (current.tmdbId === null) {
        throw new Error("That movie has no TMDB id.");
      }
      const justWatch = await justwatch.getAvailability(
        current.tmdbId,
        current.details.title,
      );
      await getDb()
        .update(movies)
        .set({
          details: sql`${movies.details} || ${JSON.stringify({ justWatch })}::jsonb`,
        })
        .where(eq(movies.id, movie.id));
    }),
    attempt("Wikipedia", async () => {
      const result = await refreshWikipedia(movie.id);
      if (result.status !== "updated") {
        throw new Error(`Wikipedia refresh failed: ${result.status}.`);
      }
    }),
    attempt("IMDb trivia", () => refreshTrivia(movie.id)),
  ]);
  // Budget fallbacks must read the freshly fetched TMDB and Wikipedia data.
  const boxOfficeFailures = await attempt("Box Office Mojo", async () => {
    const result = await refreshBoxOffice(movie.id);
    if (result.status !== "updated") {
      throw new Error(`Box office refresh failed: ${result.status}.`);
    }
  });
  const updated = await findMovieById(movie.id);
  if (!updated) throw new Error("That movie is no longer available.");
  return {
    movie: updated,
    failed: [
      ...metadataFailures.flat(),
      ...integrationFailures.flat(),
      ...boxOfficeFailures,
    ],
  };
}
