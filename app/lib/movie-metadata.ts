import type { MovieSearchResultData } from "@/app/components/MovieSearchResult";
import type {
  MDBRating,
  MDBResponse,
  MovieRatings,
  RatingSource,
} from "@/src/db/schema";
import { TMDB } from "@lorenzopant/tmdb";
import { matching, set } from "shades";

let client: TMDB | null = null;

interface MovieValues {
  tmdbId: number;
  details: Record<string, unknown>;
  ratings: MovieRatings;
}
export interface MovieMetadataProvider {
  hasCredentials(): boolean;
  search(query: string): Promise<MovieSearchResultData[]>;
  fetchMovieValues(tmdbId: number): Promise<MovieValues>;
}

/**
 * Constructed on first use rather than at module load, so importing this
 * module does not require credentials to be present.
 */
const tmdb = () =>
  (client ??= new TMDB(
    process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "",
    { language: "en-US" },
  ));

class ProdMovieProvider implements MovieMetadataProvider {
  hasCredentials = () =>
    Boolean(process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY);

  search = async (query: string) => {
    const api = tmdb();
    const response = await api.search.movies({ query, include_adult: false });

    return response.results.slice(0, 5).map((movie) => ({
      id: movie.id,
      title: movie.title,
      releaseDate: movie.release_date,
      overview: movie.overview,
      posterUrl: movie.poster_path
        ? api.images.poster(movie.poster_path, "w342")
        : null,
      tmdbRating: movie.vote_average !== 0 ? movie.vote_average : null,
    }));
  };

  fetchMovieValues = async (tmdbId: number) => {
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
  };
}

let provider: MovieMetadataProvider | undefined;

export const getMovieProvider = () => {
  if (!provider) {
    if (process.env.NODE_ENV === "test") {
      throw new Error(
        "Movie provider has not been set for testing. Use setMovieProviderForTesting().",
      );
    }
    provider = new ProdMovieProvider();
  }
  return provider;
};

export const setMovieProviderForTesting = (next: MovieMetadataProvider) => {
  provider = next;
};

/** Movie metadata shaped for the (global) movies cache table. */

async function getMdbRatings(tmdbId: number): Promise<MovieRatings> {
  const apiKey = process.env.MDB_API_KEY;
  if (!apiKey) throw new Error("MDB API credentials are not configured.");

  const response = await fetch(
    `https://api.mdblist.com/tmdb/movie/${tmdbId}?apikey=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw new Error(`MDBList returned ${response.status}.`);
  }

  const { ratings, ...raw }: MDBResponse = await response.json();

  const imdbId = raw.ids.imdb;
  const withImdbUrl = set(
    matching({ source: "imdb" }),
    "url",
  )(
    imdbId && /^tt\d+$/.test(imdbId)
      ? `https://www.imdb.com/title/${imdbId}/`
      : null,
  )(ratings);

  return {
    raw,
    services: withImdbUrl.map((rating) => ({
      ...rating,
      url: absoluteRatingUrl(rating),
    })),
  };
}

/**
 * MDBList returns relative paths (e.g. "/m/the-matrix") for several rating
 * sources, which resolve against whatever origin the page is served from
 * (localhost in dev) rather than the actual review site. Resolve those
 * against each source's real hostname.
 */
const RATING_HOSTS: Partial<Record<RatingSource, string>> = {
  tomatoes: "https://www.rottentomatoes.com",
  popcorn: "https://www.rottentomatoes.com",
  letterboxd: "https://letterboxd.com",
  metacritic: "https://www.metacritic.com",
};

function absoluteRatingUrl(rating: MDBRating): string | null {
  const { url, source } = rating;
  if (!url || typeof url !== "string") return null;
  if (/^https?:\/\//.test(url)) return url;

  const host = RATING_HOSTS[source];
  return host ? `${host}${url}` : null;
}
