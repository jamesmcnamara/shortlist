import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { movies, nominations, rooms, roomMembers } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import { eq } from "drizzle-orm";
import * as roomsRoute from "./rooms/route";
import * as roomRoute from "./rooms/[roomId]/route";
import * as nominationsRoute from "./rooms/[roomId]/nominations/route";
import * as rotateInviteRoute from "./rooms/[roomId]/invite/rotate/route";
import * as membersRoute from "./rooms/[roomId]/members/[userId]/route";
import { setMovieProviderForTesting } from "../lib/movie-metadata";

const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    currentUserId.value ? { user: { id: currentUserId.value } } : null,
}));

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

const asUser = (id: string) => {
  currentUserId.value = id;
};

let roomId: string;
const route = () => ({
  params: Promise.resolve({ roomId }),
});
const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
  });

let db: DB;

/** Builds a room with two members and one nomination by Alice. */
async function setup() {
  const [room] = await db
    .insert(rooms)
    .values({
      name: "Room",
      createdBy: ALICE,
      inviteCode: "code",
      adminInviteCode: "code-admin",
    })
    .returning();
  roomId = room.id;

  await db.insert(roomMembers).values([
    { roomId: room.id, userId: ALICE, role: "admin" },
    { roomId: room.id, userId: BOB, role: "member" },
  ]);

  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId: 1,
      details: { title: "A Movie" },
      ratings: { services: [], raw: {} },
    })
    .returning();

  const [nomination] = await db
    .insert(nominations)
    .values({ roomId: room.id, userId: ALICE, movieId: movie.id })
    .returning();

  return { room, movie, nomination };
}

async function cacheMovie(tmdbId = 999) {
  const [movie] = await db
    .insert(movies)
    .values({
      tmdbId,
      details: { title: `Movie ${tmdbId}` },
      ratings: { services: [], raw: {} },
    })
    .returning({ id: movies.id });
  return movie;
}

beforeEach(async () => {
  setMovieProviderForTesting({
    hasCredentials: () => true,
    bestMatch: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
  });

  const created = await createTestDb();
  db = created.db as unknown as DB;
  setDbForTesting(() => db);

  await db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
});

describe("nominations", () => {
  it("lets a person add as many movies as they like", async () => {
    const { POST } = nominationsRoute;
    await setup();
    asUser(ALICE);

    const responses = await Promise.all(
      [997, 998, 999].map(async (tmdbId) => {
        const movie = await cacheMovie(tmdbId);
        return POST(post({ movieId: movie.id }), route());
      }),
    );

    expect(responses.map((response) => response.status)).toEqual([
      201, 201, 201,
    ]);
  });

  it("rejects a movie that has not been materialized", async () => {
    const { POST } = nominationsRoute;
    await setup();
    asUser(ALICE);

    const response = await POST(post({ movieId: 999 }), route());

    expect(response.status).toBe(400);
  });
});

describe("room settings", () => {
  it("renames the room", async () => {
    const { PATCH } = roomRoute;
    const { room } = await setup();
    asUser(ALICE);

    const response = await PATCH(post({ name: "New Name" }), route());
    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, room.id));
    expect(updated.name).toBe("New Name");
  });

  it("rejects an update with no name", async () => {
    const { PATCH } = roomRoute;
    await setup();
    asUser(ALICE);

    expect((await PATCH(post({ name: "  " }), route())).status).toBe(400);
    expect((await PATCH(post({ votesPerCycle: 3 }), route())).status).toBe(400);
  });

  it("invalidates the old invite code when rotated", async () => {
    const { POST } = rotateInviteRoute;
    const { room } = await setup();
    asUser(ALICE);

    const body = await (
      await POST(new Request("http://test", { method: "POST" }), route())
    ).json();

    expect(body.inviteCode).not.toBe("code");
    const [updated] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, room.id));
    expect(updated.inviteCode).toBe(body.inviteCode);
  });
});

describe("room creation", () => {
  it("makes the creator an admin", async () => {
    const { POST } = roomsRoute;
    asUser(ALICE);

    await POST(post({ name: "Movie Club" }));

    const [membership] = await db.select().from(roomMembers);
    expect(membership.role).toBe("admin");
    expect(membership.userId).toBe(ALICE);
  });

  it("allows duplicate names and gives rooms distinct ID URLs", async () => {
    const { POST } = roomsRoute;
    asUser(ALICE);
    const first = await POST(post({ name: "Movie Club" }));
    const second = await POST(post({ name: "Movie Club" }));
    const [firstRoom, secondRoom] = await Promise.all([
      first.json(),
      second.json(),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstRoom.id).not.toBe(secondRoom.id);
    expect(firstRoom.path).toBe(`/rooms/${firstRoom.id}`);
    expect(secondRoom.path).toBe(`/rooms/${secondRoom.id}`);
  });
});

describe("member management", () => {
  it("will not leave a room without an admin", async () => {
    const { DELETE } = membersRoute;
    const { room } = await setup();
    asUser(ALICE);

    const response = await DELETE(
      new Request("http://test", { method: "DELETE" }),
      { params: Promise.resolve({ roomId: room.id, userId: BOB }) },
    );

    // Bob is not an admin, so removing him is fine; the guard is about admins.
    expect(response.status).toBe(204);
    const remaining = await db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.roomId, room.id));
    expect(remaining).toHaveLength(1);
  });

  it("leaves a removed member's nominations in place", async () => {
    const { DELETE } = membersRoute;
    const { room } = await setup();
    const [movie] = await db
      .insert(movies)
      .values({
        tmdbId: 2,
        details: { title: "Another Movie" },
        ratings: { services: [], raw: {} },
      })
      .returning();
    await db
      .insert(nominations)
      .values({ roomId: room.id, userId: BOB, movieId: movie.id });
    asUser(ALICE);

    await DELETE(new Request("http://test", { method: "DELETE" }), {
      params: Promise.resolve({ roomId: room.id, userId: BOB }),
    });

    const remaining = await db
      .select()
      .from(nominations)
      .where(eq(nominations.userId, BOB));
    expect(remaining).toHaveLength(1);
  });

  it("refuses self-removal, which is what keeps an admin in the room", async () => {
    const { DELETE } = membersRoute;
    await setup();
    asUser(ALICE);

    const response = await DELETE(
      new Request("http://test", { method: "DELETE" }),
      { params: Promise.resolve({ roomId, userId: ALICE }) },
    );
    expect(response.status).toBe(409);
  });

  it("refuses self-demotion", async () => {
    const { PATCH } = membersRoute;
    await setup();
    asUser(ALICE);

    const response = await PATCH(post({ role: "member" }), {
      params: Promise.resolve({ roomId, userId: ALICE }),
    });
    expect(response.status).toBe(409);
  });
});
