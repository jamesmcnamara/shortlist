import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Oscars } from "@/app/lib/data/oscars";
import {
  ProdMovieProvider,
  setMovieProviderForTesting,
} from "@/app/lib/movie-metadata";
import { setDbForTesting, type DB } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { refreshOscars } from "./oscar-data";
import { addMovie } from "@/app/lib/add-movie";

const boxOfficeHtml = await readFile(
  new URL("../app/lib/fixtures/box-office.html", import.meta.url),
  "utf8",
);

const tmdbApi = vi.hoisted(() => ({
  find: { by_id: vi.fn() },
  movies: { details: vi.fn() },
  images: { poster: vi.fn() },
}));
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@lorenzopant/tmdb", () => ({
  TMDB: vi.fn(function TMDB() {
    return tmdbApi;
  }),
}));
vi.mock("@/app/lib/justwatch", () => ({
  getAvailability: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/lib/wikipedia", () => ({
  getWikipediaUrl: vi.fn().mockResolvedValue(null),
}));

let db: TestDb;
let close: () => Promise<void>;
let directory: string;
let file: URL;

const awards = { wins: 1, nominations: 1, entries: [] };
const dataset = {
  source: "Oscar source",
  license: "BSD-2-Clause",
  updatedThrough: 2025,
  movies: {
    tt0000001: { ...awards, shortlistId: 999 },
    tt0000002: awards,
    tt0000003: awards,
  },
  nominees: {},
};
const readDataset = async (): Promise<Oscars> =>
  JSON.parse(await readFile(file, "utf8"));

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("TMDB_API_KEY", "test-key");
  vi.stubEnv("MDB_API_KEY", "test-key");
  vi.stubEnv("CRAWLORA_API_KEY", "test-key");
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  setMovieProviderForTesting(new ProdMovieProvider());
  directory = await mkdtemp(join(tmpdir(), "shortlist-oscars-"));
  file = pathToFileURL(join(directory, "oscars.json"));
  await writeFile(file, JSON.stringify(dataset));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  tmdbApi.find.by_id.mockImplementation(async ({ external_id }) => ({
    movie_results: [{ id: Number(external_id.slice(2)) }],
  }));
  tmdbApi.movies.details.mockImplementation(async ({ movie_id }) => ({
    id: movie_id,
    imdb_id: `tt${String(movie_id).padStart(7, "0")}`,
    title: `Movie ${movie_id}`,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("https://api.crawlora.net/")) {
        return Response.json({
          code: 200,
          data: {
            id: new URL(url).searchParams.get("id"),
            type: "trivia",
            facts: [],
            total: 0,
          },
        });
      }
      if (url.startsWith("https://www.boxofficemojo.com/")) {
        const imdbId = new URL(url).pathname.split("/")[2];
        return new Response(boxOfficeHtml.replaceAll("tt0816692", imdbId), {
          headers: { "Content-Type": "text/html" },
        });
      }
      return Response.json({ ratings: [], ids: {} });
    }),
  );
});

afterEach(async () => {
  setDbForTesting(null);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await close();
  await rm(directory, { recursive: true });
});

describe("Oscar movie refresh", () => {
  it("waits five minutes on each MDBList 429 and retries the same movie before continuing", async () => {
    const fetchData = vi.mocked(fetch).getMockImplementation()!;
    let remainingLimits = 2;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://api.mdblist.com/")) {
        if (remainingLimits > 0) {
          remainingLimits -= 1;
          expect(tmdbApi.find.by_id).not.toHaveBeenCalledWith({
            external_id: "tt0000002",
            external_source: "imdb_id",
          });
          return new Response("", { status: 429 });
        }
      }
      return fetchData(url, init);
    });

    expect(await refreshOscars({ file, apply: true })).toBe(0);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sleep).mock.calls).toEqual([[300_000], [300_000]]);
    expect(console.warn).toHaveBeenCalledTimes(2);
    const mdbRequests = vi
      .mocked(fetch)
      .mock.calls.map(([url]) => String(url))
      .filter((url) => url.startsWith("https://api.mdblist.com/"));
    expect(mdbRequests.map((url) => new URL(url).pathname)).toEqual([
      "/tmdb/movie/1",
      "/tmdb/movie/1",
      "/tmdb/movie/1",
      "/tmdb/movie/2",
      "/tmdb/movie/3",
    ]);
    expect(await db.select().from(movies)).toHaveLength(3);
    expect(
      Object.values((await readDataset()).movies).every(
        ({ shortlistId }) => typeof shortlistId === "number",
      ),
    ).toBe(true);
    expect(console.log).toHaveBeenCalledWith("3 linked, 0 failed.");
  });

  it("does not wait or retry other MDBList failures", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503 }));
    expect(await refreshOscars({ file, apply: true })).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
    expect((await readDataset()).movies.tt0000001.shortlistId).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith("2 linked, 1 failed.");
  });

  it.each([
    { args: ["--help"], status: 0 },
    { args: ["--unknown"], status: 1 },
  ])(
    "runs the real CLI with $args without database access",
    ({ args, status }) => {
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "refresh/oscars.ts", ...args],
        { encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } },
      );
      expect(result.status).toBe(status);
      if (status === 0) {
        expect(result.stdout).toContain("Usage: refresh:oscars [options]");
        expect(result.stderr).toBe("");
      } else {
        expect(result.stderr).toContain("unknown option");
      }
    },
  );

  it("previews without fetching, writing movies, or changing the blob", async () => {
    const before = await readFile(file, "utf8");
    expect(await refreshOscars({ file })).toBe(0);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await db.select().from(movies)).toEqual([]);
    expect(tmdbApi.find.by_id).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("[1/3] tt0000001: would import");
  });

  it("imports every movie without theatre nominations and is safe to rerun", async () => {
    expect(await refreshOscars({ file, apply: true })).toBe(0);
    const stored = await db.select().from(movies).orderBy(movies.id);
    expect(stored).toHaveLength(3);
    expect(await db.select().from(nominations)).toEqual([]);
    expect(await readDataset()).toEqual({
      ...dataset,
      movies: Object.fromEntries(
        stored.map((movie) => [
          (movie.details as { imdb_id: string }).imdb_id,
          { ...awards, shortlistId: movie.id },
        ]),
      ),
    });
    expect(tmdbApi.find.by_id).toHaveBeenCalledWith({
      external_id: "tt0000001",
      external_source: "imdb_id",
    });
    expect(tmdbApi.movies.details).toHaveBeenCalledTimes(3);
    expect(
      stored.every(
        ({ details, boxOffice }) =>
          (details as { justWatch: unknown }).justWatch !== undefined &&
          boxOffice.boxofficemojo?.worldwideGross === 782_948_164,
      ),
    ).toBe(true);
    vi.clearAllMocks();
    expect(await refreshOscars({ file, apply: true })).toBe(0);
    const rerun = await db.select().from(movies).orderBy(movies.id);
    expect(rerun.map(({ boxOffice, ...movie }) => movie)).toEqual(
      stored.map(({ boxOffice, ...movie }) => movie),
    );
    expect(tmdbApi.find.by_id).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      Object.values((await readDataset()).movies).map(
        ({ shortlistId }) => shortlistId,
      ),
    ).toEqual(stored.map(({ id }) => id));
  });

  it("reuses IMDb IDs in details or ratings and ignores stale blob IDs", async () => {
    const stored = await db
      .insert(movies)
      .values([
        {
          tmdbId: 1,
          details: { imdb_id: "tt0000001", keep: true },
          ratings: {},
        },
        {
          tmdbId: 2,
          details: { imdb_id: "" },
          ratings: { raw: { ids: { imdb: "tt0000002" } } },
        },
      ])
      .returning();
    expect(await refreshOscars({ file, apply: true })).toBe(0);
    const result = await readDataset();
    expect(result.movies.tt0000001.shortlistId).toBe(stored[0].id);
    expect(result.movies.tt0000002.shortlistId).toBe(stored[1].id);
    const reused = (await db.select().from(movies).orderBy(movies.id)).slice(
      0,
      2,
    );
    expect(reused).toMatchObject(
      stored.map(({ boxOffice, ...movie }) => movie),
    );
    expect(
      reused.every(
        ({ boxOffice }) =>
          boxOffice.boxofficemojo?.worldwideGross === 782_948_164,
      ),
    ).toBe(true);
    expect(tmdbApi.find.by_id).toHaveBeenCalledTimes(1);
  });

  it("uses the same add-time enrichment for IMDb imports and normal Shortlist IDs", async () => {
    const imported = await addMovie({ kind: "imdb", id: "tt0000001" });
    expect(imported.details.boxOffice?.worldwideGross).toBe(782_948_164);
    vi.clearAllMocks();
    const added = await addMovie({ kind: "shortlist", id: imported.id });
    expect(added.id).toBe(imported.id);
    expect(added.details.boxOffice?.worldwideGross).toBe(782_948_164);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(tmdbApi.movies.details).not.toHaveBeenCalled();
    expect(tmdbApi.find.by_id).not.toHaveBeenCalled();
    expect(await db.select().from(nominations)).toEqual([]);
  });

  it("keeps the import and logs optional enrichment failures, just like normal adds", async () => {
    const fetchData = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).startsWith("https://www.boxofficemojo.com/")) {
        throw new Error("Mojo unavailable");
      }
      return fetchData(url, init);
    });
    expect(await refreshOscars({ file, apply: true })).toBe(0);
    expect(await db.select().from(movies)).toHaveLength(3);
    expect(
      Object.values((await readDataset()).movies).every(
        ({ shortlistId }) => typeof shortlistId === "number",
      ),
    ).toBe(true);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Unable to load Box Office Mojo"),
      expect.any(Error),
    );
  });

  it.each([{ matches: [] }, { matches: [{ id: 1 }, { id: 2 }] }])(
    "reports missing or ambiguous matches and continues ($matches)",
    async ({ matches }) => {
      tmdbApi.find.by_id.mockResolvedValueOnce({ movie_results: matches });
      expect(await refreshOscars({ file, apply: true })).toBe(1);
      const result = await readDataset();
      expect(result.movies.tt0000001).toEqual(awards);
      expect(result.movies.tt0000002.shortlistId).toBeTypeOf("number");
      expect(result.movies.tt0000003.shortlistId).toBeTypeOf("number");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("Expected one TMDB movie"),
      );
      expect(console.log).toHaveBeenCalledWith("2 linked, 1 failed.");
    },
  );

  it("reports lookup and metadata failures, saves successes, and retries", async () => {
    tmdbApi.find.by_id.mockRejectedValueOnce(new Error("TMDB unavailable"));
    vi.mocked(fetch).mockResolvedValueOnce(new Response("", { status: 503 }));
    expect(await refreshOscars({ file, apply: true })).toBe(2);
    const partial = await readDataset();
    expect(partial.movies.tt0000001.shortlistId).toBeUndefined();
    expect(partial.movies.tt0000002.shortlistId).toBeUndefined();
    expect(partial.movies.tt0000003.shortlistId).toBeTypeOf("number");
    expect(console.error).toHaveBeenCalledWith(
      "[1/3] tt0000001: TMDB unavailable",
    );
    expect(console.error).toHaveBeenCalledWith(
      "[2/3] tt0000002: MDBList returned 503.",
    );
    expect(await refreshOscars({ file, apply: true })).toBe(0);
    expect(await db.select().from(movies)).toHaveLength(3);
  });

  it("does not link a TMDB movie with a mismatched IMDb ID", async () => {
    tmdbApi.movies.details.mockResolvedValueOnce({
      id: 1,
      imdb_id: "tt9999999",
      title: "Wrong movie",
    });
    expect(await refreshOscars({ file, apply: true })).toBe(1);
    expect((await readDataset()).movies.tt0000001.shortlistId).toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      "[1/3] tt0000001: TMDB movie 1 has a different IMDb ID.",
    );
  });

  it("reports missing credentials instead of attempting imports", async () => {
    vi.stubEnv("TMDB_API_KEY", "");
    vi.stubEnv("TMDB_API_READ_ACCESS_TOKEN", "");
    expect(await refreshOscars({ file, apply: true })).toBe(3);
    expect(tmdbApi.find.by_id).not.toHaveBeenCalled();
    expect(await db.select().from(movies)).toEqual([]);
  });

  it("propagates file failures without importing anything", async () => {
    await writeFile(file, "invalid JSON");
    await expect(refreshOscars({ file, apply: true })).rejects.toThrow();
    expect(tmdbApi.find.by_id).not.toHaveBeenCalled();
    expect(await db.select().from(movies)).toEqual([]);
  });
});

describe("Oscar dataset generation", () => {
  it("preserves Shortlist IDs while replacing awards, including on first generation", async () => {
    await mkdir(join(directory, "scripts"));
    await mkdir(join(directory, "public", "data"), { recursive: true });
    const generated = join(directory, "public", "data", "oscars.json");
    await writeFile(generated, JSON.stringify(dataset));
    const script = pathToFileURL(join(directory, "scripts", "update.mjs"));
    await writeFile(
      script,
      await readFile(
        new URL("../scripts/update-oscar-data.mjs", import.meta.url),
      ),
    );
    const source = [
      "FilmId\tDetail\tClass\tYear\tCanonicalCategory\tFilm\tName\tWinner",
      "tt0000001\t\tCompetitive\t2025\tBEST PICTURE\tFilm\tProducer\tTrue",
      "tt0000004\t\tCompetitive\t2025\tBEST PICTURE\tNew Film\tProducer\tFalse",
    ].join("\n");
    const generate = () => {
      const result = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `globalThis.fetch = async () => new Response(${JSON.stringify(source)}); await import(${JSON.stringify(script.href)});`,
        ],
        { encoding: "utf8" },
      );
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    };
    generate();
    const result = JSON.parse(await readFile(generated, "utf8"));
    expect(result.movies.tt0000001.shortlistId).toBe(999);
    expect(result.movies.tt0000004.shortlistId).toBeUndefined();
    expect(result.movies.tt0000002).toBeUndefined();
    await rm(generated);
    generate();
    expect(
      JSON.parse(await readFile(generated, "utf8")).movies.tt0000001,
    ).not.toHaveProperty("shortlistId");
  });
});
