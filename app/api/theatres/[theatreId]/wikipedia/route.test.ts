import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { movies, nominations, theatreMembers, theatres } from "@/src/db/schema";
import { POST } from "./route";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () => (auth.userId ? { user: { id: auth.userId } } : null),
}));

const USER = "11111111-1111-1111-1111-111111111111";
const OUTSIDER = "22222222-2222-2222-2222-222222222222";
const THEATRE = "44444444-4444-4444-4444-444444444444";
const OTHER = "55555555-5555-5555-5555-555555555555";
const context = (theatreId = THEATRE) => ({
  params: Promise.resolve({ theatreId }),
});
const request = (body: unknown) =>
  new Request("http://test/wikipedia", {
    method: "POST",
    body: JSON.stringify(body),
  });
const article = "https://en.wikipedia.org/wiki/The_Matrix";
const articleResponse = () =>
  Response.json({
    results: {
      bindings: [
        {
          item: { type: "uri", value: "http://www.wikidata.org/entity/Q83495" },
          article: { type: "uri", value: article },
        },
      ],
    },
  });

let db: TestDb;
let close: () => Promise<void>;
let movieId: number;
let otherMovieId: number;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  auth.userId = USER;
  await db.insert(authUsers).values([
    { id: USER, name: "User", email: "user@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  await db.insert(theatres).values([
    {
      id: THEATRE,
      name: "Watchlist",
      createdBy: USER,
      inviteCode: "a",
      adminInviteCode: "aa",
    },
    {
      id: OTHER,
      name: "Other",
      createdBy: USER,
      inviteCode: "b",
      adminInviteCode: "bb",
    },
  ]);
  await db
    .insert(theatreMembers)
    .values({ theatreId: THEATRE, userId: USER, role: "admin" });
  const [movie, otherMovie] = await db
    .insert(movies)
    .values([
      {
        tmdbId: 603,
        details: {
          title: "The Matrix",
          imdb_id: "tt0133093",
          year: 1999,
          justWatch: { keep: true },
          boxOffice: { keep: true },
        },
        ratings: { services: [], raw: { keep: true } },
      },
      { tmdbId: 999, details: { title: "Other" }, ratings: {} },
    ])
    .returning();
  movieId = movie.id;
  otherMovieId = otherMovie.id;
  await db.insert(nominations).values([
    {
      theatreId: THEATRE,
      userId: USER,
      movieId,
      comment: "Keep",
      completedAt: new Date(),
    },
    { theatreId: OTHER, userId: USER, movieId },
    { theatreId: OTHER, userId: USER, movieId: otherMovieId },
  ]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => articleResponse()),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await close();
});

const storedMovie = async () => {
  const [movie] = await db.select().from(movies).where(eq(movies.id, movieId));
  return movie;
};

describe("list-scoped Wikipedia refresh", () => {
  it("backfills a watched movie and preserves other metadata and nominations", async () => {
    const before = await storedMovie();
    const beforeNominations = await db.select().from(nominations);
    const response = await POST(request({ movieId }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ wikipediaUrl: article });
    const after = await storedMovie();
    expect(after).toEqual({
      ...before,
      details: { ...(before.details as object), wikipediaUrl: article },
    });
    expect(await db.select().from(nominations)).toEqual(beforeNominations);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("allows a signed-in nonmember without joining", async () => {
    auth.userId = OUTSIDER;
    const before = await db.select().from(theatreMembers);
    expect((await POST(request({ movieId }), context())).status).toBe(200);
    expect(await db.select().from(theatreMembers)).toEqual(before);
  });

  it.each([
    ["", THEATRE, 401],
    [USER, "66666666-6666-6666-6666-666666666666", 404],
  ])(
    "rejects unavailable access (%s, %s)",
    async (userId, theatreId, status) => {
      auth.userId = userId;
      expect(
        (await POST(request({ movieId }), context(theatreId))).status,
      ).toBe(status);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("rejects movies not on the current list before lookup", async () => {
    expect(
      (await POST(request({ movieId: otherMovieId }), context())).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { movieId: "1" },
    { movieId: 0 },
    { movieId: -1 },
    { movieId: 1.5 },
  ])("rejects invalid input %j", async (body) => {
    expect((await POST(request(body), context())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a movie without a TMDB id", async () => {
    await db.update(movies).set({ tmdbId: null }).where(eq(movies.id, movieId));
    expect((await POST(request({ movieId }), context())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the stored IMDb id when TMDB has no match", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ results: { bindings: [] } }))
      .mockResolvedValueOnce(articleResponse());
    expect((await POST(request({ movieId }), context())).status).toBe(200);
    const [url] = vi.mocked(fetch).mock.calls[1];
    expect(new URL(String(url)).searchParams.get("query")).toContain(
      'wdt:P345 "tt0133093"',
    );
  });

  it("stores null when no article matches", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ results: { bindings: [] } }),
    );
    const response = await POST(request({ movieId }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ wikipediaUrl: null });
    expect((await storedMovie()).details).toMatchObject({ wikipediaUrl: null });
  });

  it("logs lookup failures without clearing the saved URL", async () => {
    await POST(request({ movieId }), context());
    const before = await storedMovie();
    vi.mocked(fetch).mockRejectedValue(new Error("Wikidata unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request({ movieId }), context())).status).toBe(502);
    expect(log).toHaveBeenCalledWith(
      "Unable to load Wikipedia article.",
      expect.any(Error),
    );
    expect(await storedMovie()).toEqual(before);
  });

  it("preserves concurrent metadata edits", async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      await db
        .update(movies)
        .set({
          details: sql`jsonb_set(${movies.details}, '{description}', '"Updated concurrently"'::jsonb)`,
        })
        .where(eq(movies.id, movieId));
      return articleResponse();
    });
    expect((await POST(request({ movieId }), context())).status).toBe(200);
    expect((await storedMovie()).details).toMatchObject({
      description: "Updated concurrently",
      wikipediaUrl: article,
      justWatch: { keep: true },
      boxOffice: { keep: true },
    });
  });

  it("does not save if the nomination is removed during lookup", async () => {
    const before = await storedMovie();
    vi.mocked(fetch).mockImplementation(async () => {
      await db.delete(nominations).where(eq(nominations.theatreId, THEATRE));
      return articleResponse();
    });
    expect((await POST(request({ movieId }), context())).status).toBe(404);
    expect(await storedMovie()).toEqual(before);
  });
});
