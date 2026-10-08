import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
let close: () => Promise<void>;

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
  close = () => created.client.close();
  setDbForTesting(() => db);
  tmdbApi.movies.details.mockImplementation(({ movie_id }) =>
    Promise.resolve(details(movie_id)),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "https://apis.justwatch.com/graphql") {
        const { variables } = JSON.parse(String(init?.body));
        return Promise.resolve(Response.json({
          data: { popularTitles: { edges: [{
            node: {
              content: {
                externalIds: { tmdbId: variables.title.replace("Movie ", "") },
                fullPath: "/us/movie/test",
              },
              offers: [],
            },
          }] } },
        }));
      }
      return Promise.resolve(Response.json({
          ratings: [],
          ids: {},
      }));
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await close();
});

describe("ProdMovieProvider", () => {
  it("hydrates only the first raw search match for import", async () => {
    const provider = new ProdMovieProvider();
    tmdbApi.search.movies.mockResolvedValue({
      results: [{ id: 12 }, { id: 13 }],
    });
    const result = await provider.bestMatch("Arrival");
    expect(result?.tmdbId).toBe(12);
    expect(tmdbApi.search.movies).toHaveBeenCalledWith({
      query: "Arrival",
      include_adult: false,
    });
    expect(tmdbApi.movies.details).toHaveBeenCalledOnce();
    expect(tmdbApi.movies.details).toHaveBeenCalledWith({ movie_id: 12 });
  });

  it("returns no match only when search has no results", async () => {
    tmdbApi.search.movies.mockResolvedValue({ results: [] });
    expect(await new ProdMovieProvider().bestMatch("Unknown")).toBeNull();
    expect(tmdbApi.movies.details).not.toHaveBeenCalled();
  });

  it("does not fall through to another movie when the first match fails", async () => {
    tmdbApi.search.movies.mockResolvedValue({
      results: [{ id: 12 }, { id: 13 }],
    });
    tmdbApi.movies.details.mockRejectedValue(new Error("Metadata unavailable"));
    await expect(new ProdMovieProvider().bestMatch("Arrival")).rejects.toThrow(
      "Metadata unavailable",
    );
    expect(tmdbApi.movies.details).toHaveBeenCalledOnce();
  });

  it("surfaces a search failure rather than reporting no match", async () => {
    tmdbApi.search.movies.mockRejectedValue(new Error("Search unavailable"));
    await expect(new ProdMovieProvider().bestMatch("Arrival")).rejects.toThrow(
      "Search unavailable",
    );
  });
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
        justWatch: {
          country: "US",
          status: "matched",
          offers: [],
        },
      },
      ratings: { services: [] },
    });
    const [stored] = await db
      .select()
      .from(movies)
      .where(eq(movies.tmdbId, 11));
    expect(stored.id).toBe(result.id);
    expect(tmdbApi.movies.details).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((stored.details as MovieDetails).justWatch).toEqual(result.details.justWatch);
  });

  it("keeps movie creation working but records and logs unavailable JustWatch", async () => {
    const fetchMetadata = fetch;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) =>
      url === "https://apis.justwatch.com/graphql"
        ? Promise.reject(new Error("JustWatch unavailable"))
        : fetchMetadata(url, init),
    ));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await new ProdMovieProvider().get(11);
    expect(result.details.justWatch?.status).toBe("unavailable");
    expect(result.details.justWatch?.offers).toEqual([]);
    expect(log).toHaveBeenCalledWith(
      "Unable to load JustWatch for TMDB movie 11.",
      expect.any(Error),
    );
    expect(await db.select().from(movies)).toHaveLength(1);
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
