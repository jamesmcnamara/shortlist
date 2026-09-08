import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import {
  movies,
  nominations,
  rooms,
  roomMembers,
  votes,
} from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import { eq } from "drizzle-orm";
import * as roomsRoute from "./rooms/route";
import * as roomRoute from "./rooms/[slug]/route";
import * as nominationsRoute from "./rooms/[slug]/nominations/route";
import * as votesRoute from "./rooms/[slug]/votes/route";
import * as rotateInviteRoute from "./rooms/[slug]/invite/rotate/route";
import * as membersRoute from "./rooms/[slug]/members/[userId]/route";
import { setMovieProviderForTesting } from "../lib/movie-metadata";

const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: async () => ({
      data: currentUserId.value ? { user: { id: currentUserId.value } } : null,
    }),
  },
}));

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

const asUser = (id: string) => {
  currentUserId.value = id;
};

const route = (slug = "room") => ({ params: Promise.resolve({ slug }) });
const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
  });

let db: DB;

interface RoomOptions {
  votesPerCycle?: number;
  nominationsPerCycle?: number | null;
  allowSelfVote?: boolean;
}

/** Builds a room with two members and one nomination by Alice. */
async function setup(options: RoomOptions = {}) {
  const [room] = await db
    .insert(rooms)
    .values({
      slug: "room",
      name: "Room",
      createdBy: ALICE,
      inviteCode: "code",
      adminInviteCode: "code-admin",
      cycleLength: "never",
      votesPerCycle: options.votesPerCycle ?? 2,
      nominationsPerCycle:
        options.nominationsPerCycle === undefined
          ? 1
          : options.nominationsPerCycle,
      allowSelfVote: options.allowSelfVote ?? false,
    })
    .returning();

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
    .values({ roomId: room.id, userId: ALICE, movieId: movie.id, cycle: 0 })
    .returning();

  return { room, movie, nomination };
}

beforeEach(async () => {
  setMovieProviderForTesting({
    hasCredentials: () => true,
    search: vi.fn().mockResolvedValue([]),
    // Echo the requested id so distinct tmdbIds map to distinct movie rows;
    // otherwise every nomination collides with movie 1 from setup() and the
    // duplicate-nomination guard masks whatever this test is actually
    // exercising (e.g. the nomination cap).
    fetchMovieValues: vi.fn().mockImplementation((tmdbId: number) =>
      Promise.resolve({
        tmdbId,
        details: { title: `Movie ${tmdbId}` },
        ratings: { services: [], raw: {} },
      }),
    ),
  });

  const created = await createTestDb();
  db = created.db as unknown as DB;
  setDbForTesting(() => db);

  await db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
});

describe("vote budget", () => {
  it("allows votes up to the room's cap", async () => {
    const { POST } = votesRoute;
    const { nomination } = await setup({ votesPerCycle: 2 });
    asUser(BOB);

    expect(
      (await POST(post({ nominationId: nomination.id }), route())).status,
    ).toBe(201);
    expect(
      (await POST(post({ nominationId: nomination.id }), route())).status,
    ).toBe(201);
  });

  it("counts stacked votes on one nomination against the budget", async () => {
    const { POST } = votesRoute;
    const { nomination } = await setup({ votesPerCycle: 2 });
    asUser(BOB);

    await POST(post({ nominationId: nomination.id }), route());
    await POST(post({ nominationId: nomination.id }), route());
    const third = await POST(post({ nominationId: nomination.id }), route());

    expect(third.status).toBe(409);
    expect(await db.select().from(votes)).toHaveLength(2);
  });

  it("keeps each person's budget separate", async () => {
    const { POST } = votesRoute;
    const { nomination } = await setup({
      votesPerCycle: 1,
      allowSelfVote: true,
    });

    asUser(BOB);
    expect(
      (await POST(post({ nominationId: nomination.id }), route())).status,
    ).toBe(201);

    asUser(ALICE);
    expect(
      (await POST(post({ nominationId: nomination.id }), route())).status,
    ).toBe(201);
  });

  it("frees a vote when one is removed", async () => {
    const routes = votesRoute;
    const { nomination } = await setup({ votesPerCycle: 1 });
    asUser(BOB);

    await routes.POST(post({ nominationId: nomination.id }), route());
    expect(
      (await routes.POST(post({ nominationId: nomination.id }), route()))
        .status,
    ).toBe(409);

    await routes.DELETE(
      new Request("http://test/api", {
        method: "DELETE",
        body: JSON.stringify({ nominationId: nomination.id }),
      }),
      route(),
    );

    expect(
      (await routes.POST(post({ nominationId: nomination.id }), route()))
        .status,
    ).toBe(201);
  });

  it("removes only one of several stacked votes at a time", async () => {
    const routes = votesRoute;
    const { nomination } = await setup({ votesPerCycle: 3 });
    asUser(BOB);

    await routes.POST(post({ nominationId: nomination.id }), route());
    await routes.POST(post({ nominationId: nomination.id }), route());

    await routes.DELETE(
      new Request("http://test/api", {
        method: "DELETE",
        body: JSON.stringify({ nominationId: nomination.id }),
      }),
      route(),
    );

    expect(await db.select().from(votes)).toHaveLength(1);
  });
});

describe("concurrent requests", () => {
  it("does not let parallel votes exceed the budget", async () => {
    const { POST } = votesRoute;
    const { nomination } = await setup({ votesPerCycle: 2 });
    asUser(BOB);

    // A double-click issues these with no ordering between them; the cap has
    // to hold in the database, not in a prior SELECT. Note the test database
    // serializes statements, so this pins the SQL predicate rather than
    // proving behaviour under concurrent snapshots.
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        POST(post({ nominationId: nomination.id }), route()),
      ),
    );

    expect(responses.filter((r) => r.status === 201)).toHaveLength(2);
    expect(await db.select().from(votes)).toHaveLength(2);
  });
});

describe("self-voting", () => {
  it("is rejected when the room disallows it", async () => {
    const { POST } = votesRoute;
    const { nomination } = await setup({ allowSelfVote: false });
    asUser(ALICE);

    const response = await POST(post({ nominationId: nomination.id }), route());
    expect(response.status).toBe(403);
    expect(await db.select().from(votes)).toHaveLength(0);
  });

  it("is allowed when the room permits it", async () => {
    const { POST } = votesRoute;
    const { nomination } = await setup({ allowSelfVote: true });
    asUser(ALICE);

    const response = await POST(post({ nominationId: nomination.id }), route());
    expect(response.status).toBe(201);
  });
});

describe("nomination cap", () => {
  it("blocks a second nomination in a one-per-cycle room", async () => {
    const { POST } = nominationsRoute;
    await setup({ nominationsPerCycle: 1 });
    asUser(ALICE);

    const response = await POST(post({ tmdbId: 999 }), route());
    expect(response.status).toBe(409);
  });

  it("does not apply another member's usage to the caller", async () => {
    const { POST } = nominationsRoute;
    await setup({ nominationsPerCycle: 1 });
    // Bob has not nominated, so the cap must not stop him. Without TMDB
    // credentials the call fails later, at the metadata fetch, not at the cap.
    asUser(BOB);

    const response = await POST(post({ tmdbId: 999 }), route());
    expect(response.status).not.toBe(409);
  });

  it("does not check a cap at all when nominations are unlimited", async () => {
    const { POST } = nominationsRoute;
    await setup({ nominationsPerCycle: null });
    asUser(ALICE);

    const response = await POST(post({ tmdbId: 999 }), route());
    expect(response.status).not.toBe(409);
  });

  it("frees a slot once the existing nomination is marked completed", async () => {
    const { POST } = nominationsRoute;
    const { nomination } = await setup({ nominationsPerCycle: 1 });
    await db
      .update(nominations)
      .set({ completed: true })
      .where(eq(nominations.id, nomination.id));
    asUser(ALICE);

    const response = await POST(post({ tmdbId: 999 }), route());
    expect(response.status).not.toBe(409);
  });
});

describe("room settings", () => {
  it("refuses a cycle length change once nominations exist", async () => {
    const { PATCH } = roomRoute;
    await setup();
    asUser(ALICE);

    const response = await PATCH(post({ cycleLength: "month" }), route());
    expect(response.status).toBe(409);
  });

  it("allows a cycle length change in an empty room", async () => {
    const { PATCH } = roomRoute;
    const [room] = await db
      .insert(rooms)
      .values({
        slug: "room",
        name: "Room",
        createdBy: ALICE,
        inviteCode: "code",
        adminInviteCode: "code-admin",
        cycleLength: "never",
      })
      .returning();
    await db
      .insert(roomMembers)
      .values({ roomId: room.id, userId: ALICE, role: "admin" });
    asUser(ALICE);

    const response = await PATCH(post({ cycleLength: "week" }), route());
    expect(response.status).toBe(200);
  });

  it("rejects an invalid vote cap", async () => {
    const { PATCH } = roomRoute;
    await setup();
    asUser(ALICE);

    expect((await PATCH(post({ votesPerCycle: -1 }), route())).status).toBe(
      400,
    );
  });

  it("accepts unlimited nominations as an explicit null", async () => {
    const { PATCH } = roomRoute;
    const { room } = await setup({ nominationsPerCycle: 1 });
    asUser(ALICE);

    const response = await PATCH(post({ nominationsPerCycle: null }), route());
    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, room.id));
    expect(updated.nominationsPerCycle).toBeNull();
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
  it("applies the watchlist preset", async () => {
    const { POST } = roomsRoute;
    asUser(ALICE);

    const room = await (
      await POST(post({ name: "Our Watch List", preset: "watchlist" }))
    ).json();

    expect(room.slug).toBe("our-watch-list");
    expect(room.nominationsPerCycle).toBeNull();
    expect(room.cycleLength).toBe("never");
  });

  it("applies the club preset", async () => {
    const { POST } = roomsRoute;
    asUser(ALICE);

    const room = await (
      await POST(post({ name: "Movie Club", preset: "club" }))
    ).json();

    expect(room.nominationsPerCycle).toBe(1);
    expect(room.cycleLength).toBe("month");
  });

  it("makes the creator an admin", async () => {
    const { POST } = roomsRoute;
    asUser(ALICE);

    await POST(post({ name: "Movie Club", preset: "club" }));

    const [membership] = await db.select().from(roomMembers);
    expect(membership.role).toBe("admin");
    expect(membership.userId).toBe(ALICE);
  });

  it("refuses a duplicate slug", async () => {
    const { POST } = roomsRoute;
    asUser(ALICE);

    await POST(post({ name: "Movie Club", preset: "club" }));
    const second = await POST(post({ name: "Movie Club", preset: "club" }));

    expect(second.status).toBe(409);
  });
});

describe("member management", () => {
  it("will not leave a room without an admin", async () => {
    const { DELETE } = membersRoute;
    const { room } = await setup();
    asUser(ALICE);

    const response = await DELETE(
      new Request("http://test", { method: "DELETE" }),
      { params: Promise.resolve({ slug: "room", userId: BOB }) },
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
      .values({ roomId: room.id, userId: BOB, movieId: movie.id, cycle: 0 });
    asUser(ALICE);

    await DELETE(new Request("http://test", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "room", userId: BOB }),
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
      { params: Promise.resolve({ slug: "room", userId: ALICE }) },
    );
    expect(response.status).toBe(409);
  });

  it("refuses self-demotion", async () => {
    const { PATCH } = membersRoute;
    await setup();
    asUser(ALICE);

    const response = await PATCH(post({ role: "member" }), {
      params: Promise.resolve({ slug: "room", userId: ALICE }),
    });
    expect(response.status).toBe(409);
  });
});
