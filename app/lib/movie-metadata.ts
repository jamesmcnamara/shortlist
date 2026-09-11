import type {
  MDBRating,
  MDBResponse,
  Movie,
  MovieDetails,
  MovieRatings,
  RatingSource,
} from "@/src/db/schema";
import { movies } from "@/src/db/schema";
import { getDb } from "@/src/db/client";
import { TMDB } from "@lorenzopant/tmdb";
import { eq } from "drizzle-orm";
import { matching, set } from "shades";

let client: TMDB | null = null;

export interface MovieMetadataProvider {
  hasCredentials(): boolean;
  search(query: string): Promise<Movie[]>;
  get(tmdbId: number): Promise<Movie>;
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

type StoredMovieRow = Pick<
  typeof movies.$inferSelect,
  "id" | "tmdbId" | "details" | "ratings" | "createdAt"
>;

const movieFromRow = (row: StoredMovieRow): Movie => {
  if (row.tmdbId === null) {
    throw new Error(`Stored movie ${row.id} has no TMDB id.`);
  }

  return {
    id: row.id,
    tmdbId: row.tmdbId,
    details: row.details as MovieDetails,
    ratings: row.ratings as MovieRatings,
    createdAt: row.createdAt,
  };
};

const storedMovieSelection = {
  id: movies.id,
  tmdbId: movies.tmdbId,
  details: movies.details,
  ratings: movies.ratings,
  createdAt: movies.createdAt,
};

export class ProdMovieProvider implements MovieMetadataProvider {
  hasCredentials = () =>
    Boolean(
      (process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY) &&
      process.env.MDB_API_KEY,
    );

  search = async (query: string) => {
    const response = await tmdb().search.movies({
      query,
      include_adult: false,
    });
    const results = await Promise.allSettled(
      response.results.slice(0, 3).map(({ id }) => this.get(id)),
    );

    return results.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];
      console.error(result.reason);
      return [];
    });
  };

  get = async (tmdbId: number) => {
    const db = getDb();
    const [cached] = await db
      .select()
      .from(movies)
      .where(eq(movies.tmdbId, tmdbId))
      .limit(1);
    if (cached) return movieFromRow(cached);

    const api = tmdb();
    const [details, ratings] = await Promise.all([
      api.movies.details({ movie_id: tmdbId }),
      getMdbRatings(tmdbId),
    ]);

    const values = {
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

    const [inserted] = await db
      .insert(movies)
      .values(values)
      .onConflictDoNothing({ target: movies.tmdbId })
      .returning(storedMovieSelection);
    if (inserted) return movieFromRow(inserted);

    const [winner] = await db
      .select(storedMovieSelection)
      .from(movies)
      .where(eq(movies.tmdbId, tmdbId))
      .limit(1);
    if (!winner) {
      throw new Error(`Unable to store movie ${tmdbId}.`);
    }
    return movieFromRow(winner);
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
