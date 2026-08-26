import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import {
  movies,
  nominations,
  nomcoms,
  rooms,
  roomMembers,
  seen,
  votes,
} from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import { loadRoom } from "@/app/lib/load-room";
// One namespace import per route module, aliased `<name>Route`, so every
// handler keeps its real export name (GET/POST/PATCH/DELETE) without
// colliding across the many routes a single test file exercises.
import * as roomsRoute from "./rooms/route";
import * as roomRoute from "./rooms/[slug]/route";
import * as nominationsRoute from "./rooms/[slug]/nominations/route";
import * as votesRoute from "./rooms/[slug]/votes/route";
import * as nomcomsRoute from "./rooms/[slug]/nomcoms/route";
import * as seenRoute from "./rooms/[slug]/seen/route";
import * as rotateInviteRoute from "./rooms/[slug]/invite/rotate/route";
import * as joinRoute from "./join/[code]/route";

// Auth is the one thing stubbed; everything below it runs for real.
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
const MALLORY = "33333333-3333-3333-3333-333333333333";

const asUser = (id: string) => {
  currentUserId.value = id;
};

interface Fixture {
  db: DB;
  roomA: { id: string; slug: string };
  roomB: { id: string; slug: string };
  nominationInA: number;
  nominationInB: number;
  movieInA: number;
  movieInB: number;
}

let fixture: Fixture;

const route = (slug: string) => ({ params: Promise.resolve({ slug }) });
const post = (body: unknown) =>
  new Request("http://test/api", {
    method: "POST",
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  const { db } = await createTestDb();
  setDbForTesting(() => db as unknown as DB);

  await db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
    { id: MALLORY, name: "Mallory", email: "mallory@example.com" },
  ]);

  const [roomA] = await db
    .insert(rooms)
    .values({
      slug: "club",
      name: "Club",
      createdBy: ALICE,
      inviteCode: "invite-a",
      adminInviteCode: "invite-a-admin",
      nominationsPerCycle: 1,
      votesPerCycle: 2,
      cycleLength: "never",
    })
    .returning();

  const [roomB] = await db
    .insert(rooms)
    .values({
      slug: "secret",
      name: "Secret",
      createdBy: MALLORY,
      inviteCode: "invite-b",
      adminInviteCode: "invite-b-admin",
      nominationsPerCycle: null,
      votesPerCycle: 5,
      cycleLength: "never",
    })
    .returning();

  await db.insert(roomMembers).values([
    { roomId: roomA.id, userId: ALICE, role: "admin" },
    { roomId: roomA.id, userId: BOB, role: "member" },
    { roomId: roomB.id, userId: MALLORY, role: "admin" },
  ]);

  const insertedMovies = await db
    .insert(movies)
    .values([
      {
        tmdbId: 1,
        details: { title: "Public Movie" },
        ratings: { services: [], raw: {} },
      },
      {
        tmdbId: 2,
        details: { title: "Private Movie" },
        ratings: { services: [], raw: {} },
      },
    ])
    .returning();

  const [nomA] = await db
    .insert(nominations)
    .values({
      roomId: roomA.id,
      userId: ALICE,
      movieId: insertedMovies[0].id,
      cycle: 0,
    })
    .returning();

  const [nomB] = await db
    .insert(nominations)
    .values({
      roomId: roomB.id,
      userId: MALLORY,
      movieId: insertedMovies[1].id,
      cycle: 0,
    })
    .returning();

  await db.insert(seen).values([
    { movieId: insertedMovies[1].id, userId: MALLORY },
    // Mallory is not in room A, so this must never surface on its nomination.
    { movieId: insertedMovies[0].id, userId: MALLORY },
  ]);

  fixture = {
    db: db as unknown as DB,
    roomA,
    roomB,
    nominationInA: nomA.id,
    nominationInB: nomB.id,
    movieInA: insertedMovies[0].id,
    movieInB: insertedMovies[1].id,
  };
});

describe("room membership", () => {
  it("returns only the caller's own room contents", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const response = await GET(new Request("http://test"), route("club"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].movie.details.title).toBe("Public Movie");
  });

  it("hides a room the caller does not belong to", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const response = await GET(new Request("http://test"), route("secret"));

    // 404 rather than 403, so slugs cannot be probed for existence.
    expect(response.status).toBe(404);
  });

  it("rejects anonymous callers", async () => {
    const { GET } = nominationsRoute;
    asUser("");

    const response = await GET(new Request("http://test"), route("club"));
    expect(response.status).toBe(401);
  });

  it("lists only rooms the caller belongs to", async () => {
    const { GET } = roomsRoute;
    asUser(BOB);

    const body = await (await GET(new Request("http://test"))).json();
    expect(body.map((room: { slug: string }) => room.slug)).toEqual(["club"]);
  });
});

describe("cross-room writes", () => {
  it("cannot vote on another room's nomination through its own room", async () => {
    const { POST } = votesRoute;
    asUser(BOB);

    const response = await POST(
      post({ nominationId: fixture.nominationInB }),
      route("club"),
    );

    expect(response.status).toBe(404);
    const cast = await fixture.db.select().from(votes);
    expect(cast).toHaveLength(0);
  });

  it("cannot comment on another room's nomination", async () => {
    const { POST } = nomcomsRoute;
    asUser(BOB);

    const response = await POST(
      post({ nominationId: fixture.nominationInB, comment: "hello" }),
      route("club"),
    );

    expect(response.status).toBe(404);
    expect(await fixture.db.select().from(nomcoms)).toHaveLength(0);
  });

  it("cannot delete another room's nomination", async () => {
    const { DELETE } = nominationsRoute;
    asUser(BOB);

    const response = await DELETE(
      new Request(`http://test/api?id=${fixture.nominationInB}`, {
        method: "DELETE",
      }),
      route("club"),
    );

    expect(response.status).toBe(404);
    expect(await fixture.db.select().from(nominations)).toHaveLength(2);
  });

  it("cannot delete someone else's nomination in its own room", async () => {
    const { DELETE } = nominationsRoute;
    asUser(BOB);

    const response = await DELETE(
      new Request(`http://test/api?id=${fixture.nominationInA}`, {
        method: "DELETE",
      }),
      route("club"),
    );

    expect(response.status).toBe(404);
  });

  it("does not report a non-member's viewing on a shared movie", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const body = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    // Mallory has seen this movie, but is not in room A.
    expect(body[0].seenBy).toEqual([]);
  });

  it("shows a room member's own viewing on the nomination", async () => {
    const { POST } = seenRoute;
    const { GET } = nominationsRoute;
    asUser(BOB);

    const marked = await POST(
      post({ movieId: fixture.movieInA }),
      route("club"),
    );
    expect(marked.status).toBe(201);

    const body = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(body[0].seenBy.map((user: { id: string }) => user.id)).toEqual([
      BOB,
    ]);
  });

  it("refuses to mark a movie that is not on the acting room's list", async () => {
    const { POST } = seenRoute;
    asUser(BOB);

    const response = await POST(
      post({ movieId: fixture.movieInB }),
      route("club"),
    );

    expect(response.status).toBe(404);
    // Room B's own marking is untouched, and nothing was recorded for Bob.
    const rows = await fixture.db.select().from(seen);
    expect(rows.filter((row) => row.userId === BOB)).toHaveLength(0);
  });
});

describe("admin-only routes", () => {
  it("refuses a config change from a non-admin member", async () => {
    const { PATCH } = roomRoute;
    asUser(BOB);

    const response = await PATCH(post({ votesPerCycle: 99 }), route("club"));
    expect(response.status).toBe(403);

    const [room] = await fixture.db.select().from(rooms);
    expect(room.votesPerCycle).toBe(2);
  });

  it("allows an admin to change config", async () => {
    const { PATCH } = roomRoute;
    asUser(ALICE);

    const response = await PATCH(post({ votesPerCycle: 4 }), route("club"));
    expect(response.status).toBe(200);
  });

  it("refuses a non-member entirely", async () => {
    const { PATCH } = roomRoute;
    asUser(MALLORY);

    const response = await PATCH(post({ votesPerCycle: 99 }), route("club"));
    expect(response.status).toBe(404);
  });

  it("withholds the invite code from non-admins", async () => {
    const { GET } = roomRoute;
    asUser(BOB);
    const asMember = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(asMember.inviteCode).toBeUndefined();
    // The embedded room object must not smuggle it through either.
    expect(asMember.room.inviteCode).toBeUndefined();
    expect(JSON.stringify(asMember)).not.toContain("invite-a");

    asUser(ALICE);
    const asAdmin = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(asAdmin.inviteCode).toBe("invite-a");
  });

  it("keeps the invite code out of the server-rendered room payload", async () => {
    asUser(BOB);

    const result = await loadRoom("club");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // This object is serialized into the RSC payload for every member.
    expect(JSON.stringify(result.data.room)).not.toContain("invite-a");
  });

  it("does not leak the invite code through a config update", async () => {
    const { PATCH } = roomRoute;
    asUser(ALICE);

    const body = await (
      await PATCH(post({ votesPerCycle: 3 }), route("club"))
    ).json();
    expect(body.inviteCode).toBeUndefined();
  });
});

describe("invites", () => {
  it("invalidates the previous code when an admin rotates the invite", async () => {
    const { POST: rotate } = rotateInviteRoute;
    const { POST: join } = joinRoute;
    asUser(ALICE);

    const rotated = await rotate(
      new Request("http://test", { method: "POST" }),
      route("club"),
    );
    expect(rotated.status).toBe(200);
    const { inviteCode } = await rotated.json();
    expect(inviteCode).not.toBe("invite-a");

    asUser(MALLORY);
    expect(
      (
        await join(new Request("http://test", { method: "POST" }), {
          params: Promise.resolve({ code: "invite-a" }),
        })
      ).status,
    ).toBe(404);
  });

  it("adds the caller to the room behind the code", async () => {
    const { POST } = joinRoute;
    asUser(BOB);

    const response = await POST(
      new Request("http://test", { method: "POST" }),
      {
        params: Promise.resolve({ code: "invite-b" }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: "secret" });
  });

  it("treats re-joining as a no-op", async () => {
    const { POST } = joinRoute;
    asUser(BOB);
    const request = () =>
      POST(new Request("http://test", { method: "POST" }), {
        params: Promise.resolve({ code: "invite-a" }),
      });

    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);

    const members = await fixture.db.select().from(roomMembers);
    expect(members.filter((m) => m.userId === BOB)).toHaveLength(1);
  });

  it("rejects an unknown code", async () => {
    const { POST } = joinRoute;
    asUser(BOB);

    const response = await POST(
      new Request("http://test", { method: "POST" }),
      { params: Promise.resolve({ code: "nope" }) },
    );
    expect(response.status).toBe(404);
  });

  it("adds the caller to the room as an admin via the admin invite code", async () => {
    const { POST } = joinRoute;
    asUser(BOB);

    const response = await POST(
      new Request("http://test", { method: "POST" }),
      { params: Promise.resolve({ code: "invite-b-admin" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ slug: "secret" });

    const [membership] = await fixture.db
      .select()
      .from(roomMembers)
      .where(
        and(
          eq(roomMembers.userId, BOB),
          eq(
            roomMembers.roomId,
            (
              await fixture.db
                .select({ id: rooms.id })
                .from(rooms)
                .where(eq(rooms.slug, "secret"))
            )[0].id,
          ),
        ),
      );
    expect(membership.role).toBe("admin");
  });

  it("rotates the admin invite independently of the member invite", async () => {
    const { POST: rotate } = rotateInviteRoute;
    const { POST: join } = joinRoute;
    asUser(ALICE);

    const rotated = await rotate(
      new Request("http://test", {
        method: "POST",
        body: JSON.stringify({ kind: "admin" }),
      }),
      route("club"),
    );
    expect(rotated.status).toBe(200);
    const { adminInviteCode } = await rotated.json();
    expect(adminInviteCode).not.toBe("invite-a-admin");

    // The member invite still works — only the admin code was rotated.
    asUser(MALLORY);
    expect(
      (
        await join(new Request("http://test", { method: "POST" }), {
          params: Promise.resolve({ code: "invite-a" }),
        })
      ).status,
    ).toBe(200);

    asUser(BOB);
    expect(
      (
        await join(new Request("http://test", { method: "POST" }), {
          params: Promise.resolve({ code: "invite-a-admin" }),
        })
      ).status,
    ).toBe(404);
  });
});
