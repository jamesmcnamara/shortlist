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
import { TMDB, type MovieResultItem } from "@lorenzopant/tmdb";
import { eq, sql } from "drizzle-orm";
import { find, matching, set } from "shades";
import * as justwatch from "./justwatch";
import { getWikipediaUrl } from "./wikipedia";
import { serializeMovie } from "./movie";
import { validTmdbBudget } from "./box-office";

let client: TMDB | null = null;

export interface MovieMetadataProvider {
  hasCredentials(): boolean;
  search(query: string): Promise<Movie[]>;
  bestMatch(query: string, year?: number): Promise<Movie | null>;
  get(tmdbId: number): Promise<Movie>;
}

const comparableTitle = (title = "") =>
  title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// Equal, or one is the other plus extra whole words ("Dune" / "Dune Part Two").
const sameTitle = (a: string, b: string) => {
  const [x, y] = [comparableTitle(a), comparableTitle(b)];
  return (
    Boolean(x && y) &&
    (x === y || x.startsWith(`${y} `) || y.startsWith(`${x} `))
  );
};

const isSameMovie =
  (title: string, year: number) =>
  (result: MovieResultItem): boolean =>
    Math.abs(Number.parseInt(result.release_date, 10) - year) <= 1 &&
    [result.title, result.original_title].some((candidate) =>
      sameTitle(candidate, title),
    );

const tmdb = () =>
  (client ??= new TMDB(
    process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "",
    { language: "en-US" },
  ));

type StoredMovieRow = typeof movies.$inferSelect;

const movieFromRow = (row: StoredMovieRow): Movie => {
  if (row.tmdbId === null) {
    throw new Error(`Stored movie ${row.id} has no TMDB id.`);
  }

  return serializeMovie(row);
};

const storedMovieSelection = {
  id: movies.id,
  tmdbId: movies.tmdbId,
  details: movies.details,
  ratings: movies.ratings,
  boxOffice: movies.boxOffice,
  createdAt: movies.createdAt,
};

async function getTmdbDetails(tmdbId: number): Promise<MovieDetails> {
  const api = tmdb();
  const details = await api.movies.details({ movie_id: tmdbId });
  return {
    ...details,
    posterUrl: details.poster_path
      ? api.images.poster(details.poster_path, "w342")
      : null,
    description: details.overview ?? null,
    year: details.release_date
      ? Number(details.release_date.slice(0, 4)) || null
      : null,
  };
}

export async function refreshTmdbMetadata(movie: Movie) {
  if (movie.tmdbId === null) throw new Error("That movie has no TMDB id.");
  const details = await getTmdbDetails(movie.tmdbId);
  const sources = {
    tmdb: { budget: validTmdbBudget.safeParse(details.budget).data ?? null },
  };
  await getDb()
    .update(movies)
    .set({
      details: sql`${movies.details} || ${JSON.stringify(details)}::jsonb`,
      boxOffice: sql`${movies.boxOffice} || ${JSON.stringify(sources)}::jsonb`,
    })
    .where(eq(movies.id, movie.id));
}

export async function refreshRatings(movie: Movie) {
  if (movie.tmdbId === null) throw new Error("That movie has no TMDB id.");
  const ratings = await getMdbRatings(movie.tmdbId);
  await getDb().update(movies).set({ ratings }).where(eq(movies.id, movie.id));
}

export async function findMovieById(id: number): Promise<Movie | null> {
  const [row] = await getDb()
    .select(storedMovieSelection)
    .from(movies)
    .where(eq(movies.id, id))
    .limit(1);
  return row ? movieFromRow(row) : null;
}

export async function getMovieByImdbId(imdbId: string): Promise<Movie> {
  const [cached] = await getDb()
    .select(storedMovieSelection)
    .from(movies)
    .where(
      eq(
        sql`coalesce(nullif(${movies.details}->>'imdb_id', ''), ${movies.ratings}->'raw'->'ids'->>'imdb')`,
        imdbId,
      ),
    )
    .limit(1);
  if (cached) return movieFromRow(cached);

  const provider = getMovieProvider();
  if (!provider.hasCredentials()) {
    throw new Error("TMDB and MDBList credentials are required.");
  }
  const api = tmdb();
  const { movie_results: matches } = await api.find.by_id({
    external_id: imdbId,
    external_source: "imdb_id",
  });
  if (matches.length !== 1) {
    throw new Error(`Expected one TMDB movie, found ${matches.length}.`);
  }
  const movie = await provider.get(matches[0].id);
  if (movie.details.imdb_id !== imdbId) {
    throw new Error(`TMDB movie ${matches[0].id} has a different IMDb ID.`);
  }
  return movie;
}

export class ProdMovieProvider implements MovieMetadataProvider {
  hasCredentials = () =>
    Boolean(
      (process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY) &&
      process.env.MDB_API_KEY,
    );

  search = async (query: string) => {
    const api = tmdb();
    const response = await api.search.movies({
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

  bestMatch = async (query: string, year?: number): Promise<Movie | null> => {
    const api = tmdb();
    const response = await api.search.movies({
      query,
      include_adult: false,
    });
    const match =
      year === undefined
        ? response.results[0]
        : find(isSameMovie(query, year))(response.results);
    return match ? this.get(match.id) : null;
  };

  get = async (tmdbId: number) => {
    const db = getDb();
    const [cached] = await db
      .select()
      .from(movies)
      .where(eq(movies.tmdbId, tmdbId))
      .limit(1);
    if (cached) return movieFromRow(cached);

    const [details, ratings] = await Promise.all([
      getTmdbDetails(tmdbId),
      getMdbRatings(tmdbId),
    ]);
    const [justWatch, wikipediaUrl] = await Promise.all([
      justwatch
        .getAvailability(tmdbId, details.title)
        .catch((error: unknown) => {
          console.error(
            `Unable to load JustWatch for TMDB movie ${tmdbId}.`,
            error,
          );
          return justwatch.unavailable();
        }),
      getWikipediaUrl(tmdbId, details.imdb_id).catch((error: unknown) => {
        console.error(
          `Unable to load Wikipedia for TMDB movie ${tmdbId}.`,
          error,
        );
        return null;
      }),
    ]);

    const values = {
      tmdbId: details.id,
      details: {
        ...details,
        justWatch,
        wikipediaUrl,
      },
      ratings,
      boxOffice: {
        tmdb: {
          budget: validTmdbBudget.safeParse(details.budget).data ?? null,
        },
      },
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

export class MdbRateLimitError extends Error {
  constructor() {
    super("MDBList returned 429.");
    this.name = "MdbRateLimitError";
  }
}

async function getMdbRatings(tmdbId: number): Promise<MovieRatings> {
  const apiKey = process.env.MDB_API_KEY;
  if (!apiKey) throw new Error("MDB API credentials are not configured.");

  const response = await fetch(
    `https://api.mdblist.com/tmdb/movie/${tmdbId}?apikey=${encodeURIComponent(apiKey)}`,
  );
  if (response.status === 429) throw new MdbRateLimitError();
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
