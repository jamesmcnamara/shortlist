import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { refreshBoxOffice } from "@/app/lib/enrich-box-office";
import { refreshWikipedia } from "@/app/lib/enrich-wikipedia";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { movies, nominations, theatres } from "@/src/db/schema";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { runRefresh } from "./run";

const USER = "11111111-1111-1111-1111-111111111111";
const THEATRE = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const ARTICLE = "https://en.wikipedia.org/wiki/Interstellar_(film)";
const html = readFileSync(
  new URL("../app/lib/fixtures/box-office.html", import.meta.url),
  "utf8",
);
const wikipediaResponse = () =>
  Response.json({
    results: {
      bindings: [
        {
          item: {
            type: "uri",
            value: "http://www.wikidata.org/entity/Q13417189",
          },
          article: { type: "uri", value: ARTICLE },
        },
      ],
    },
  });
const boxOfficeResponse = () =>
  new Response(html, { headers: { "Content-Type": "text/html" } });

let db: TestDb;
let close: () => Promise<void>;
let ids: number[];

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(wikipediaResponse));
  await db.insert(authUsers).values({
    id: USER,
    name: "User",
    email: "user@example.com",
  });
  await db.insert(theatres).values(
    [THEATRE, OTHER].map((id) => ({
      id,
      name: id === THEATRE ? "Watchlist" : "Other",
      createdBy: USER,
      inviteCode: id,
      adminInviteCode: `admin-${id}`,
    })),
  );
  const stored = await db
    .insert(movies)
    .values(
      [157336, 603, 999].map((tmdbId) => ({
        tmdbId,
        details: {
          title: String(tmdbId),
          imdb_id: "tt0816692",
          budget: 1,
          wikipediaUrl: "https://en.wikipedia.org/wiki/Old",
          boxOffice: { keep: true },
          justWatch: { keep: true },
        },
        ratings: { keep: true },
      })),
    )
    .returning({ id: movies.id });
  ids = stored.map(({ id }) => id);
  await db.insert(nominations).values([
    {
      theatreId: THEATRE,
      userId: USER,
      movieId: ids[0],
      completedAt: new Date(),
    },
    { theatreId: THEATRE, userId: USER, movieId: ids[1] },
    { theatreId: OTHER, userId: USER, movieId: ids[0] },
    { theatreId: OTHER, userId: USER, movieId: ids[2] },
  ]);
});

afterEach(async () => {
  setDbForTesting(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await close();
});

const storedMovies = () => db.select().from(movies).orderBy(movies.id);

describe("command-line theatre refresh", () => {
  it("previews all theatres once per shared movie, excluding unnominated cached movies", async () => {
    await db.insert(movies).values({
      tmdbId: 1000,
      details: { title: "Not nominated" },
      ratings: {},
    });
    const before = await storedMovies();
    const refresh = vi.fn();
    expect(await runRefresh(refresh)).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await storedMovies()).toEqual(before);
    expect(console.log).toHaveBeenCalledWith(
      "Would refresh 3 movies across all theatres.",
    );
    expect(console.log).toHaveBeenCalledWith(`[3/3] 999 (${ids[2]})`);
  });

  it.each([
    ["Wikipedia", refreshWikipedia, wikipediaResponse],
    ["box office", refreshBoxOffice, boxOfficeResponse],
  ])(
    "refreshes %s globally without repeating shared movies",
    async (_name, refresh, response) => {
      vi.mocked(fetch).mockImplementation(async () => response());
      const before = await storedMovies();
      const beforeNominations = await db.select().from(nominations);
      expect(await runRefresh(refresh, { apply: true })).toBe(0);
      expect(fetch).toHaveBeenCalledTimes(3);
      const after = await storedMovies();
      expect(
        after.every(
          (movie, index) =>
            JSON.stringify(movie.details) !==
            JSON.stringify(before[index].details),
        ),
      ).toBe(true);
      expect(await db.select().from(nominations)).toEqual(beforeNominations);
      expect(console.log).toHaveBeenCalledWith("3 updated, 0 failed.");
    },
  );

  it("continues into other theatres after a global refresh failure", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockImplementation(async () => wikipediaResponse());
    const before = await storedMovies();
    expect(await runRefresh(refreshWikipedia, { apply: true })).toBe(1);
    const after = await storedMovies();
    expect(after[0]).toEqual(before[0]);
    expect(after[1].details).toHaveProperty("wikipediaUrl", ARTICLE);
    expect(after[2].details).toHaveProperty("wikipediaUrl", ARTICLE);
    expect(console.log).toHaveBeenCalledWith("2 updated, 1 failed.");
  });

  it("handles a global run with no nominations", async () => {
    await db.delete(nominations);
    expect(await runRefresh(refreshWikipedia, { apply: true })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("0 updated, 0 failed.");
  });

  it("previews only distinct movies in the theatre, including Watched, without fetching or writing", async () => {
    const before = await storedMovies();
    const refresh = vi.fn();
    expect(await runRefresh(refresh, { theatreId: THEATRE })).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(await storedMovies()).toEqual(before);
    expect(console.log).toHaveBeenCalledWith(
      `Would refresh 2 movies in "Watchlist" (${THEATRE}).`,
    );
    expect(console.log).toHaveBeenCalledWith(`[1/2] 157336 (${ids[0]})`);
    expect(console.log).toHaveBeenCalledWith(`[2/2] 603 (${ids[1]})`);
  });

  it("refreshes Wikipedia once per movie and preserves unrelated data", async () => {
    const before = await storedMovies();
    const beforeNominations = await db.select().from(nominations);
    expect(
      await runRefresh(refreshWikipedia, { theatreId: THEATRE, apply: true }),
    ).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await storedMovies()).toEqual(
      before.map((movie, index) =>
        index < 2
          ? {
              ...movie,
              details: { ...(movie.details as object), wikipediaUrl: ARTICLE },
            }
          : movie,
      ),
    );
    expect(await db.select().from(nominations)).toEqual(beforeNominations);
    expect(console.log).toHaveBeenCalledWith("2 updated, 0 failed.");
  });

  it("refreshes box office through the existing scraper and budget fallback", async () => {
    vi.mocked(fetch).mockImplementation(
      async () =>
        new Response(html.replace("$165,000,000", "-"), {
          headers: { "Content-Type": "text/html" },
        }),
    );
    const before = await storedMovies();
    const beforeNominations = await db.select().from(nominations);
    expect(
      await runRefresh(refreshBoxOffice, { theatreId: THEATRE, apply: true }),
    ).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    const after = await storedMovies();
    expect(after[2]).toEqual(before[2]);
    for (const index of [0, 1]) {
      expect(after[index]).toMatchObject({
        ...before[index],
        details: {
          ...(before[index].details as object),
          boxOffice: {
            source: "boxofficemojo",
            budget: 1,
            worldwideGross: 782_948_164,
          },
        },
      });
    }
    expect(await db.select().from(nominations)).toEqual(beforeNominations);
  });

  it.each([
    ["Wikipedia", refreshWikipedia, wikipediaResponse],
    ["box office", refreshBoxOffice, boxOfficeResponse],
  ])(
    "preserves old data and continues after a %s failure",
    async (_name, refresh, response) => {
      const before = await storedMovies();
      vi.mocked(fetch)
        .mockRejectedValueOnce(new Error("Service unavailable"))
        .mockImplementation(async () => response());
      expect(
        await runRefresh(refresh, { theatreId: THEATRE, apply: true }),
      ).toBe(1);
      const after = await storedMovies();
      expect(after[0]).toEqual(before[0]);
      expect(after[1]).not.toEqual(before[1]);
      expect(after[2]).toEqual(before[2]);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("1 updated, 1 failed.");
    },
  );

  it.each([
    ["Wikipedia", refreshWikipedia, wikipediaResponse],
    ["box office", refreshBoxOffice, boxOfficeResponse],
  ])(
    "reports missing IDs without stopping the %s batch",
    async (_name, refresh, response) => {
      await db
        .update(movies)
        .set({ tmdbId: null, details: {}, ratings: {} })
        .where(eq(movies.id, ids[0]));
      vi.mocked(fetch).mockImplementation(async () => response());
      const before = await storedMovies();
      expect(
        await runRefresh(refresh, { theatreId: THEATRE, apply: true }),
      ).toBe(1);
      expect((await storedMovies())[0]).toEqual(before[0]);
      expect(fetch).toHaveBeenCalledOnce();
      expect(console.log).toHaveBeenCalledWith("1 updated, 1 failed.");
    },
  );

  it("stores null for a successful Wikipedia lookup without a match", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ results: { bindings: [] } }),
    );
    expect(
      await runRefresh(refreshWikipedia, { theatreId: THEATRE, apply: true }),
    ).toBe(0);
    expect((await storedMovies())[0].details).toHaveProperty(
      "wikipediaUrl",
      null,
    );
    expect((await storedMovies())[1].details).toHaveProperty(
      "wikipediaUrl",
      null,
    );
  });

  it.each([
    ["Wikipedia", refreshWikipedia, wikipediaResponse],
    ["box office", refreshBoxOffice, boxOfficeResponse],
  ])(
    "does not write %s data if a nomination is removed during lookup",
    async (_name, refresh, response) => {
      const before = await storedMovies();
      vi.mocked(fetch)
        .mockImplementationOnce(async () => {
          await db.delete(nominations).where(eq(nominations.movieId, ids[0]));
          return response();
        })
        .mockImplementation(async () => response());
      expect(
        await runRefresh(refresh, { theatreId: THEATRE, apply: true }),
      ).toBe(1);
      expect((await storedMovies())[0]).toEqual(before[0]);
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects an unknown theatre rather than reporting an empty success", async () => {
    await expect(
      runRefresh(refreshWikipedia, {
        theatreId: "44444444-4444-4444-4444-444444444444",
        apply: true,
      }),
    ).rejects.toThrow("Theatre not found");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("handles an empty theatre without fetching", async () => {
    await db.delete(nominations).where(eq(nominations.theatreId, THEATRE));
    expect(
      await runRefresh(refreshWikipedia, { theatreId: THEATRE, apply: true }),
    ).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith("0 updated, 0 failed.");
  });
});
