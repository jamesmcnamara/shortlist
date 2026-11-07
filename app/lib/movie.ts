import type {
  Movie,
  MovieDetails,
  MovieRatings,
  movies,
} from "@/src/db/schema";
import { resolveBoxOffice } from "./box-office";

export function serializeMovie(row: typeof movies.$inferSelect): Movie {
  const { boxOffice: sources, ...movie } = row;
  const boxOffice = resolveBoxOffice(sources);
  return {
    ...movie,
    details: {
      ...(movie.details as MovieDetails),
      ...(boxOffice && { boxOffice }),
    },
    ratings: movie.ratings as MovieRatings,
  };
}
