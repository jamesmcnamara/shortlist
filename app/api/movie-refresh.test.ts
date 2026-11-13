import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { movies } from "@/src/db/schema";
import { addMovie } from "@/app/lib/add-movie";
import { findMovieById } from "@/app/lib/movie-metadata";
import { POST } from "./movies/[movieId]/refresh/route";

const mocks = vi.hoisted(() => ({ userId: "user", tmdb: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    mocks.userId ? { user: { id: mocks.userId } } : null,
}));
vi.mock("@lorenzopant/tmdb", () => ({
  TMDB: vi.fn(function () {
    return {
      movies: { details: mocks.tmdb },
      images: { poster: (path: string) => `https://image.test${path}` },
    };
  }),
}));

const mojo = readFileSync(
  new URL("../lib/fixtures/box-office.html", import.meta.url),
  "utf8",
);
const ID = "tt0816692";
const ARTICLE = "https://en.wikipedia.org/wiki/Interstellar_(film)";
const trivia = {
  url: `https://www.imdb.com/title/${ID}/trivia/`,
  fetchedAt: "2026-01-01T00:00:00Z",
  items: ["Previously saved trivia."],
};
const triviaResponse = () =>
  Response.json({
    code: 200,
    data: {
      id: ID,
      type: "trivia",
      facts: [{ text: "A new & interesting fact.", spoiler: false }],
      total: 1,
    },
  });
let db: TestDb;
let close: () => Promise<void>;
let movieId: number;
const fetchMock = vi.fn<typeof fetch>();
const refresh = (id: string | number = movieId) =>
  POST(new Request("http://test", { method: "POST" }), {
    params: Promise.resolve({ movieId: String(id) }),
  });

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  mocks.userId = "user";
  vi.stubEnv("MDB_API_KEY", "test");
  vi.stubEnv("CRAWLORA_API_KEY", "test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.tmdb.mockReset().mockResolvedValue({
    id: 157336,
    title: "Refreshed title",
    imdb_id: ID,
    budget: 200,
    overview: "New overview",
    release_date: "2014-11-07",
    poster_path: null,
  });
  fetchMock.mockReset().mockImplementation(async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.crawlora.net/")) return triviaResponse();
    if (url.startsWith("https://www.boxofficemojo.com/")) {
      return new Response(mojo, { headers: { "Content-Type": "text/html" } });
    }
    if (url.startsWith("https://api.mdblist.com/")) {
      return Response.json({
        ids: { imdb: ID },
        ratings: [{ source: "imdb", value: 9, url: null }],
      });
    }
    if (url.startsWith("https://query.wikidata.org/sparql?")) {
      return Response.json({
        results: {
          bindings: [
            {
              item: {
                type: "uri",
                value: "https://www.wikidata.org/entity/Q1",
              },
              article: { type: "uri", value: ARTICLE },
            },
          ],
        },
      });
    }
    if (url === "https://apis.justwatch.com/graphql") {
      return Response.json({
        data: {
          popularTitles: {
            edges: [
              {
                node: {
                  content: {
                    externalIds: { tmdbId: "157336" },
                    fullPath: "/us/movie/interstellar",
                  },
                  offers: [],
                },
              },
            ],
          },
        },
      });
    }
    throw new Error(`Unexpected external request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 157336,
      details: {
        title: "Old title",
        imdb_id: ID,
        budget: 100,
        trivia,
        justWatch: { status: "unavailable", offers: [] },
        wikipediaUrl: null,
        customKey: "keep me",
      },
      ratings: { services: [], raw: {} },
      boxOffice: { manual: { budget: 25 } },
    })
    .returning();
  movieId = movie.id;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await close();
});

describe("unified movie refresh", () => {
  it("refreshes all integrations, retains unrelated JSON and manual budgets", async () => {
    const response = await refresh();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      failed: [],
      movie: {
        details: {
          title: "Refreshed title",
          customKey: "keep me",
          wikipediaUrl: ARTICLE,
          trivia: { items: ["A new & interesting fact."] },
          justWatch: { status: "matched" },
          boxOffice: {
            budget: 25,
            budgetSource: "manual",
            worldwideGross: 782_948_164,
          },
        },
        ratings: { services: [{ source: "imdb", value: 9 }] },
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(mocks.tmdb).toHaveBeenCalledOnce();
    expect((await findMovieById(movieId))?.details.trivia?.items).toEqual([
      "A new & interesting fact.",
    ]);
  });

  it("reports partial failures, preserves those values and still saves other updates", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://api.crawlora.net/"))
        return new Response("", { status: 403 });
      if (String(url) === "https://apis.justwatch.com/graphql")
        throw new Error("Offline");
      return normalFetch(url, init);
    });
    mocks.tmdb.mockRejectedValue(new Error("TMDB unavailable"));
    const result = await (await refresh()).json();
    expect(result.failed).toEqual(["TMDB", "JustWatch", "IMDb trivia"]);
    expect(result.movie).toMatchObject({
      details: {
        title: "Old title",
        trivia,
        justWatch: { status: "unavailable" },
        wikipediaUrl: ARTICLE,
        boxOffice: { worldwideGross: 782_948_164 },
      },
      ratings: { services: [{ value: 9 }] },
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("uses fresh TMDB and Wikipedia data for the box-office budget fallback", async () => {
    await db
      .update(movies)
      .set({ boxOffice: {} })
      .where(eq(movies.id, movieId));
    mocks.tmdb.mockResolvedValue({
      id: 157336,
      title: "Refreshed title",
      imdb_id: ID,
      budget: 0,
      overview: "",
      release_date: "2014-11-07",
      poster_path: null,
    });
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://www.boxofficemojo.com/")) {
        return new Response(mojo.replace("$165,000,000", "-"), {
          headers: { "Content-Type": "text/html" },
        });
      }
      if (String(url).startsWith("https://en.wikipedia.org/w/api.php?")) {
        expect(new URL(String(url)).searchParams.get("page")).toBe(
          "Interstellar_(film)",
        );
        return Response.json({
          parse: {
            text: '<table class="infobox"><tr><th>Budget</th><td>$50 million</td></tr></table>',
          },
        });
      }
      return normalFetch(url, init);
    });
    const result = await (await refresh()).json();
    expect(result.failed).toEqual([]);
    expect(result.movie.details.boxOffice).toMatchObject({
      budget: 50_000_000,
      budgetSource: "wikipedia",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("reports every integration when all sources fail and preserves previous data", async () => {
    const before = await findMovieById(movieId);
    mocks.tmdb.mockRejectedValue(new Error("Offline"));
    fetchMock.mockRejectedValue(new Error("Offline"));
    const result = await (await refresh()).json();
    expect(result.failed).toEqual([
      "TMDB",
      "MDBList",
      "JustWatch",
      "Wikipedia",
      "IMDb trivia",
      "Box Office Mojo",
    ]);
    expect(result.movie.details).toEqual(before?.details);
    expect(result.movie.ratings).toEqual(before?.ratings);
  });

  it("reports an unreadable stored movie without attempting external work", async () => {
    await db
      .update(movies)
      .set({ tmdbId: null, details: { title: "No ids" } })
      .where(eq(movies.id, movieId));
    const response = await refresh();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "Couldn't refresh this movie. Try again.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires sign-in before any external request", async () => {
    mocks.userId = "";
    expect((await refresh()).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.tmdb).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid", 400],
    ["-1", 400],
    ["2147483648", 400],
    ["99999", 404],
  ])("rejects movie %s without external work", async (id, status) => {
    expect((await refresh(id)).status).toBe(status);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.tmdb).not.toHaveBeenCalled();
  });
});

describe("add-time trivia enrichment", () => {
  it("uses the IMDb ID in cached MDBList data when TMDB has none", async () => {
    await db
      .update(movies)
      .set({
        details: sql`${movies.details} - 'imdb_id'`,
        ratings: { services: [], raw: { ids: { imdb: ID } } },
      })
      .where(eq(movies.id, movieId));
    const movie = await addMovie({ kind: "shortlist", id: movieId });
    expect(movie.details.trivia?.items).toEqual(["A new & interesting fact."]);
  });
  it.each(["shortlist", "imdb"] as const)(
    "saves trivia through the common %s add flow",
    async (kind) => {
      const movie = await addMovie(
        kind === "shortlist" ? { kind, id: movieId } : { kind, id: ID },
      );
      expect(movie.details.trivia?.items).toEqual([
        "A new & interesting fact.",
      ]);
      expect(movie.details.title).toBe("Old title");
      const [stored] = await db
        .select()
        .from(movies)
        .where(eq(movies.id, movieId));
      expect(stored.details).toMatchObject({
        customKey: "keep me",
        trivia: movie.details.trivia,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps the movie and earlier trivia when Crawlora rejects the add-time lookup", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) =>
      String(url).startsWith("https://api.crawlora.net/")
        ? new Response("", { status: 403 })
        : normalFetch(url, init),
    );
    const movie = await addMovie({ kind: "shortlist", id: movieId });
    expect(movie.details.trivia).toEqual(trivia);
    expect(movie.details.boxOffice?.worldwideGross).toBe(782_948_164);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Unable to load IMDb trivia"),
      expect.any(Error),
    );
  });

  it("preserves earlier trivia when Crawlora returns only part of the collection", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) =>
      String(url).startsWith("https://api.crawlora.net/")
        ? Response.json({
            code: 200,
            data: {
              id: ID,
              type: "trivia",
              facts: [{ text: "Only one fact." }],
              total: 245,
            },
          })
        : normalFetch(url, init),
    );
    const result = await (await refresh()).json();
    expect(result.failed).toEqual(["IMDb trivia"]);
    expect(result.movie.details.trivia).toEqual(trivia);
  });

  it("keeps adds usable and reports refresh failure when the key is missing", async () => {
    vi.stubEnv("CRAWLORA_API_KEY", "");
    const movie = await addMovie({ kind: "shortlist", id: movieId });
    expect(movie.details.trivia).toEqual(trivia);
    const result = await (await refresh()).json();
    expect(result.failed).toEqual(["IMDb trivia"]);
    expect(result.movie.details.trivia).toEqual(trivia);
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("https://api.crawlora.net/"),
      ),
    ).toBe(false);
  });
});
