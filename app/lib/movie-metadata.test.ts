import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ProdMovieProvider } from "@/app/lib/movie-metadata";
import { setDbForTesting, type DB } from "@/src/db/client";
import { createTestDb } from "@/src/db/test-db";
import { movies, type MovieDetails } from "@/src/db/schema";

const tmdbApi = vi.hoisted(() => ({
  search: {
    movies: vi.fn(),
  },
  movies: {
    details: vi.fn(),
  },
  images: {
    poster: vi.fn(
      (path: string, size: string) => `https://image.test/${size}${path}`,
    ),
  },
}));

vi.mock("@lorenzopant/tmdb", () => ({
  TMDB: vi.fn(function TMDB() {
    return tmdbApi;
  }),
}));

let db: DB;

const details = (id: number) =>
  ({
    id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    release_date: "2025-01-02",
    poster_path: `/movie-${id}.jpg`,
    vote_average: 7.5,
  }) as MovieDetails;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("TMDB_API_KEY", "test-key");
  vi.stubEnv("MDB_API_KEY", "test-key");
  const created = await createTestDb();
  db = created.db as unknown as DB;
  setDbForTesting(() => db);
  tmdbApi.movies.details.mockImplementation(({ movie_id }) =>
    Promise.resolve(details(movie_id)),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        Response.json({
          ratings: [],
          ids: {},
        }),
      ),
    ),
  );
});

describe("ProdMovieProvider", () => {
  it("requires credentials for both metadata services", () => {
    const provider = new ProdMovieProvider();

    expect(provider.hasCredentials()).toBe(true);
    vi.stubEnv("MDB_API_KEY", "");
    expect(provider.hasCredentials()).toBe(false);
  });

  it("returns a stored movie without calling either metadata API", async () => {
    const [stored] = await db
      .insert(movies)
      .values({
        tmdbId: 10,
        details: details(10),
        ratings: { services: [], raw: { cached: true } },
      })
      .returning();

    const result = await new ProdMovieProvider().get(10);

    expect(result).toEqual({
      id: stored.id,
      tmdbId: 10,
      details: details(10),
      ratings: { services: [], raw: { cached: true } },
      createdAt: stored.createdAt,
    });
    expect(tmdbApi.movies.details).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches, normalizes, and stores a cache miss", async () => {
    const result = await new ProdMovieProvider().get(11);

    expect(result).toMatchObject({
      tmdbId: 11,
      details: {
        title: "Movie 11",
        posterUrl: "https://image.test/w342/movie-11.jpg",
        description: "Overview 11",
        year: 2025,
      },
      ratings: { services: [] },
    });
    const [stored] = await db
      .select()
      .from(movies)
      .where(eq(movies.tmdbId, 11));
    expect(stored.id).toBe(result.id);
    expect(tmdbApi.movies.details).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns one stored row when concurrent misses race", async () => {
    const provider = new ProdMovieProvider();

    const [first, second] = await Promise.all([
      provider.get(12),
      provider.get(12),
    ]);

    expect(first.id).toBe(second.id);
    expect(await db.select().from(movies)).toHaveLength(1);
  });

  it("hydrates only the first three results and omits failed movies", async () => {
    const provider = new ProdMovieProvider();
    tmdbApi.search.movies.mockResolvedValue({
      results: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
    });
    provider.get = vi.fn((id: number) =>
      id === 2
        ? Promise.reject(new Error("MDBList failed"))
        : Promise.resolve({
            id: id + 100,
            tmdbId: id,
            details: details(id),
            ratings: { services: [], raw: {} },
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
          }),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const results = await provider.search("movie");

    expect(provider.get).toHaveBeenCalledTimes(3);
    expect(provider.get).toHaveBeenNthCalledWith(1, 1);
    expect(provider.get).toHaveBeenNthCalledWith(2, 2);
    expect(provider.get).toHaveBeenNthCalledWith(3, 3);
    expect(results.map(({ tmdbId }) => tmdbId)).toEqual([1, 3]);
  });
});
