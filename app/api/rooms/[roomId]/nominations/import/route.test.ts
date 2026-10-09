import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { movies, nominations, roomMembers, rooms, type Movie } from "@/src/db/schema";
import { setMovieProviderForTesting } from "@/app/lib/movie-metadata";
import { POST } from "./route";

const auth = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () => auth.userId ? { user: { id: auth.userId } } : null,
}));

const OWNER = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";
const OUTSIDER = "33333333-3333-3333-3333-333333333333";
const context = (roomId = "44444444-4444-4444-4444-444444444444") => ({
  params: Promise.resolve({ roomId }),
});
const request = (body: unknown) => new Request("http://test/import", {
  method: "POST",
  body: JSON.stringify(body),
});

let db: TestDb;
let close: () => Promise<void>;
let roomId: string;
let otherRoomId: string;
let movie: Movie;
const bestMatch = vi.fn<(title: string) => Promise<Movie | null>>();

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  close = () => created.client.close();
  setDbForTesting(() => db as unknown as DB);
  auth.userId = MEMBER;
  bestMatch.mockReset();
  setMovieProviderForTesting({
    hasCredentials: () => true,
    bestMatch,
    get: vi.fn(),
    search: vi.fn(),
  });
  await db.insert(authUsers).values([
    { id: OWNER, name: "Owner", email: "owner@example.com" },
    { id: MEMBER, name: "Member", email: "member@example.com" },
    { id: OUTSIDER, name: "Outsider", email: "outsider@example.com" },
  ]);
  const insertedRooms = await db.insert(rooms).values([
    { id: "44444444-4444-4444-4444-444444444444", name: "Watchlist", createdBy: OWNER, inviteCode: "a", adminInviteCode: "admin-a" },
    { id: "55555555-5555-5555-5555-555555555555", name: "Other", createdBy: OWNER, inviteCode: "b", adminInviteCode: "admin-b" },
  ]).returning();
  roomId = insertedRooms[0].id;
  otherRoomId = insertedRooms[1].id;
  await db.insert(roomMembers).values([
    { roomId, userId: OWNER, role: "admin" },
    { roomId, userId: MEMBER, role: "member" },
    { roomId: otherRoomId, userId: OWNER, role: "admin" },
  ]);
  const [stored] = await db.insert(movies).values({
    tmdbId: 123,
    details: { id: 123, title: "Arrival", year: 2016 },
    ratings: { services: [], raw: {} },
  }).returning({ id: movies.id, createdAt: movies.createdAt });
  movie = {
    ...stored,
    tmdbId: 123,
    details: {
      id: 123, title: "Arrival", year: 2016,
    } as Movie["details"],
    ratings: { services: [], raw: {} },
  };
  bestMatch.mockResolvedValue(movie);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await close();
});

describe("per-title movie import", () => {
  it("adds a member's trimmed title with no note to the authorized room", async () => {
    const response = await POST(request({ title: " Arrival " }), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "added",
      movie: { id: movie.id, title: "Arrival", year: 2016 },
    });
    expect(bestMatch).toHaveBeenCalledWith("Arrival");
    expect(await db.select().from(nominations)).toEqual([
      expect.objectContaining({
        roomId, userId: MEMBER, movieId: movie.id, comment: null, completed: false,
      }),
    ]);
  });

  it.each([
    ["unauthenticated", "", "44444444-4444-4444-4444-444444444444", 401],
    ["nonmember", OUTSIDER, "44444444-4444-4444-4444-444444444444", 404],
    ["other room", MEMBER, "55555555-5555-5555-5555-555555555555", 404],
    ["missing room", MEMBER, "66666666-6666-6666-6666-666666666666", 404],
  ])("rejects %s before looking up a movie", async (_name, userId, roomId, status) => {
    auth.userId = userId;
    expect((await POST(request({ title: "Arrival" }), context(roomId))).status).toBe(status);
    expect(bestMatch).not.toHaveBeenCalled();
    expect(await db.select().from(nominations)).toHaveLength(0);
  });

  it.each([null, {}, { title: 123 }, { title: "" }, { title: " \n " }, { title: "A\nB" }, { title: "A".repeat(301) }])(
    "rejects invalid input %j",
    async (body) => {
      expect((await POST(request(body), context())).status).toBe(400);
      expect(bestMatch).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed JSON", async () => {
    const response = await POST(new Request("http://test/import", {
      method: "POST", body: "{",
    }), context());
    expect(response.status).toBe(400);
    expect(bestMatch).not.toHaveBeenCalled();
  });

  it("accepts the maximum title length", async () => {
    expect((await POST(request({ title: "A".repeat(300) }), context())).status).toBe(200);
    expect(bestMatch).toHaveBeenCalledWith("A".repeat(300));
  });

  it.each([false, true])("leaves existing nominations untouched (completed=%s)", async (completed) => {
    const [existing] = await db.insert(nominations).values({
      roomId, userId: OWNER, movieId: movie.id, comment: "Keep this note", completed,
    }).returning();
    const response = await POST(request({ title: "Arrival" }), context());
    expect((await response.json()).status).toBe("already_on_list");
    expect(await db.select().from(nominations)).toEqual([existing]);
  });

  it("does not treat nominations in another room as duplicates", async () => {
    await db.insert(nominations).values({
      roomId: otherRoomId, userId: OWNER, movieId: movie.id,
    });
    const response = await POST(request({ title: "Arrival" }), context());
    expect((await response.json()).status).toBe("added");
    expect(await db.select().from(nominations).where(eq(nominations.roomId, roomId))).toHaveLength(1);
  });

  it("handles concurrent requests and subsequent retries without duplicates", async () => {
    const results = await Promise.all([
      POST(request({ title: "Arrival" }), context()),
      POST(request({ title: "Arrival" }), context()),
    ]);
    const statuses = await Promise.all(results.map(async (response) => (await response.json()).status));
    expect(statuses.sort()).toEqual(["added", "already_on_list"]);
    expect((await (await POST(request({ title: "Arrival" }), context())).json()).status).toBe("already_on_list");
    expect(await db.select().from(nominations)).toHaveLength(1);
  });

  it("reports no match without writing a nomination", async () => {
    bestMatch.mockResolvedValue(null);
    const response = await POST(request({ title: "Unknown" }), context());
    expect(await response.json()).toEqual({ status: "not_found" });
    expect(await db.select().from(nominations)).toHaveLength(0);
  });

  it("skips different input titles that resolve to the same movie", async () => {
    await POST(request({ title: "Arrival" }), context());
    const response = await POST(request({ title: "arrival 2016" }), context());
    expect((await response.json()).status).toBe("already_on_list");
    expect(bestMatch).toHaveBeenLastCalledWith("arrival 2016");
    expect(await db.select().from(nominations)).toHaveLength(1);
  });

  it("reports and logs a persistence failure rather than reporting success", async () => {
    bestMatch.mockResolvedValue({ ...movie, id: movie.id + 100 });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request({ title: "Arrival" }), context());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to import this movie." });
    expect(log).toHaveBeenCalled();
    expect(await db.select().from(nominations)).toHaveLength(0);
  });

  it("reports and logs metadata failures separately from no match", async () => {
    bestMatch.mockRejectedValue(new Error("Metadata unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await POST(request({ title: "Arrival" }), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Unable to look up this movie right now. Try again.",
    });
    expect(log).toHaveBeenCalled();
    expect(await db.select().from(nominations)).toHaveLength(0);
  });

  it("reports missing credentials before lookup", async () => {
    setMovieProviderForTesting({
      hasCredentials: () => false, bestMatch, search: vi.fn(), get: vi.fn(),
    });
    const response = await POST(request({ title: "Arrival" }), context());
    expect(response.status).toBe(503);
    expect(bestMatch).not.toHaveBeenCalled();
  });
});
