import { enrichBoxOffice } from "./enrich-box-office";
import { findMovieById, getMovieByImdbId } from "./movie-metadata";

type MovieIdentifier =
  { kind: "shortlist"; id: number } | { kind: "imdb"; id: string };

export async function addMovie(identifier: MovieIdentifier) {
  const movie =
    identifier.kind === "shortlist"
      ? await findMovieById(identifier.id)
      : await getMovieByImdbId(identifier.id);
  if (!movie) throw new Error("That movie is no longer available.");

  await enrichBoxOffice(movie.id);
  const enriched = await findMovieById(movie.id);
  if (!enriched) throw new Error("That movie is no longer available.");
  return enriched;
}
