import { set, matching, find } from "shades";
import { TMDB } from "@lorenzopant/tmdb";
import type { RatingSource, MovieRatings, MDBResponse } from "@/src/db/schema";

let client: TMDB | null = null;

/**
 * Constructed on first use rather than at module load, so importing this
 * module does not require credentials to be present.
 */
const tmdb = () =>
  (client ??= new TMDB(
    process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "",
    { language: "en-US" },
  ));

export const hasTmdbCredentials = () =>
  Boolean(process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY);

/** Movie metadata shaped for the (global) movies cache table. */
export async function fetchMovieValues(tmdbId: number){
  const api = tmdb();
  const details = await api.movies.details({ movie_id: tmdbId });
  const ratings = await getMdbRatings(tmdbId);

  return {
    tmdbId: details.id,
    details: {
      ...details,
      posterUrl: details.poster_path
      ? api.images.poster(details.poster_path, "w342")
      : null,
    description: details.overview ?? null,
    year: details.release_date
      ? Number(details.release_date.slice(0, 4)) || null
      : null,
    },
    ratings,

  };
}



async function getMdbRatings(tmdbId: number): Promise<MovieRatings> {
  const apiKey = process.env.MDB_API_KEY;
  if (!apiKey) throw new Error("MDB API credentials are not configured.");

  const response = await fetch(
    `https://api.mdblist.com/tmdb/movie/${tmdbId}?apikey=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw new Error(`MDBList returned ${response.status}.`);
  }

  const {ratings, ...raw}: MDBResponse = await response.json();

  const imdbId = raw.ids.imdb;
  return {
    raw,
    services: set(matching({source: "imdb"}), "url")(
        imdbId && /^tt\d+$/.test(imdbId)
          ? `https://www.imdb.com/title/${imdbId}/`
          : null,

  )(ratings),
  }
}
