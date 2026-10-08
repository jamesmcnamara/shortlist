import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { movies, nominations, roomMembers, rooms, type MovieDetails } from "@/src/db/schema";
import { POST } from "./route";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () => auth.userId ? { user: { id: auth.userId } } : null,
}));

const OWNER = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const context = (slug = "watchlist") => ({
  params: Promise.resolve({ slug: `${OWNER}:${slug}` }),
});
const request = (body: unknown) => new Request("http://test/justwatch", {
  method: "POST", body: JSON.stringify(body),
});
const availabilityResponse = () => Response.json({
  data: { popularTitles: { edges: [{
    node: {
      content: { externalIds: { tmdbId: "603" }, fullPath: "/us/movie/the-matrix" },
      offers: [{
        monetizationType: "FLATRATE",
        standardWebURL: "https://www.netflix.com/title/123",
        package: { packageId: 8, clearName: "Netflix", icon: "/icon/123/s100/netflix.png" },
      }],
    },
  }] } },
});

let db: TestDb;
let close: () => Promise<void>;
let roomId: string;
let movieId: number;
let privateMovieId: number;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  auth.userId = MEMBER;
  await db.insert(authUsers).values([
    { id: OWNER, name: "Owner", email: "owner@example.com" },
    { id: MEMBER, name: "Member", email: "member@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  const [room, other] = await db.insert(rooms).values([
    { slug: "watchlist", name: "Watchlist", createdBy: OWNER, inviteCode: "a", adminInviteCode: "aa" },
    { slug: "other", name: "Other", createdBy: OWNER, inviteCode: "b", adminInviteCode: "bb" },
  ]).returning();
  roomId = room.id;
  await db.insert(roomMembers).values([
    { roomId, userId: MEMBER, role: "member" },
    { roomId: other.id, userId: OWNER, role: "admin" },
  ]);
  const [movie, privateMovie] = await db.insert(movies).values([
    { tmdbId: 603, details: { title: "The Matrix", year: 1999 }, ratings: { services: [], raw: { keep: true } } },
    { tmdbId: 999, details: { title: "Private" }, ratings: {} },
  ]).returning();
  movieId = movie.id;
  privateMovieId = privateMovie.id;
  await db.insert(nominations).values([
    { roomId, userId: MEMBER, movieId, comment: "Keep this", completed: true },
    { roomId: other.id, userId: OWNER, movieId: privateMovieId },
    { roomId: other.id, userId: OWNER, movieId },
  ]);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => availabilityResponse()));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await close();
});

describe("list-scoped JustWatch refresh", () => {
  it("backfills a member's watched movie without changing metadata or nominations", async () => {
    const before = await db.select().from(nominations);
    const response = await POST(request({ movieId }), context());
    expect(response.status).toBe(200);
    const availability = await response.json();
    expect(availability.status).toBe("matched");
    const [movie] = await db.select().from(movies).where(eq(movies.id, movieId));
    expect(movie.details).toEqual({ title: "The Matrix", year: 1999, justWatch: availability });
    expect(movie.ratings).toEqual({ services: [], raw: { keep: true } });
    expect(await db.select().from(nominations)).toEqual(before);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["anonymous", "", "watchlist", 401],
    ["nonmember", OUTSIDER, "watchlist", 404],
    ["other room", MEMBER, "other", 404],
    ["missing room", MEMBER, "missing", 404],
  ])("rejects %s before external lookup", async (_name, userId, slug, status) => {
    auth.userId = userId;
    expect((await POST(request({ movieId }), context(slug))).status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cannot update a movie belonging only to another room", async () => {
    expect((await POST(request({ movieId: privateMovieId }), context())).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    const [movie] = await db.select().from(movies).where(eq(movies.id, privateMovieId));
    expect(movie.details).toEqual({ title: "Private" });
  });

  it.each([null, {}, { movieId: "1" }, { movieId: 0 }, { movieId: -1 }, { movieId: 1.5 }])(
    "rejects invalid input %j",
    async (body) => {
      expect((await POST(request(body), context())).status).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("reports a movie without a TMDB id without looking it up", async () => {
    await db.update(movies).set({ tmdbId: null }).where(eq(movies.id, movieId));
    expect((await POST(request({ movieId }), context())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs lookup failures and preserves previous availability for retry", async () => {
    await POST(request({ movieId }), context());
    const [before] = await db.select().from(movies).where(eq(movies.id, movieId));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unavailable")));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request({ movieId }), context());
    expect(response.status).toBe(502);
    expect(log).toHaveBeenCalled();
    const [after] = await db.select().from(movies).where(eq(movies.id, movieId));
    expect(after).toEqual(before);
  });

  it("reports and stores an unmatched movie without guessing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      data: { popularTitles: { edges: [] } },
    })));
    const response = await POST(request({ movieId }), context());
    expect((await response.json()).status).toBe("not_found");
    const [movie] = await db.select().from(movies).where(eq(movies.id, movieId));
    expect((movie.details as MovieDetails).justWatch?.status).toBe("not_found");
  });

  it("preserves changes made to other details during a lookup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      await db.update(movies).set({
        details: { title: "The Matrix", year: 1999, description: "Updated while fetching" },
      }).where(eq(movies.id, movieId));
      return availabilityResponse();
    }));
    expect((await POST(request({ movieId }), context())).status).toBe(200);
    const [movie] = await db.select().from(movies).where(eq(movies.id, movieId));
    expect(movie.details).toMatchObject({ description: "Updated while fetching", justWatch: { status: "matched" } });
  });

  it("does not save data after the movie is removed from this list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      await db.delete(nominations).where(eq(nominations.roomId, roomId));
      return availabilityResponse();
    }));
    expect((await POST(request({ movieId }), context())).status).toBe(404);
    const [movie] = await db.select().from(movies).where(eq(movies.id, movieId));
    expect((movie.details as MovieDetails).justWatch).toBeUndefined();
  });
});
