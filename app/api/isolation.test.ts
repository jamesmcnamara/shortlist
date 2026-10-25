import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import {
  movies,
  nominations,
  nomcoms,
  theatres,
  theatreMembers,
  seen,
} from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import { loadTheatre } from "@/app/lib/load-theatre";
// One namespace import per route module, aliased `<name>Route`, so every
// handler keeps its real export name (GET/POST/PATCH/DELETE) without
// colliding across the many routes a single test file exercises.
import * as theatresRoute from "./theatres/route";
import * as theatreRoute from "./theatres/[theatreId]/route";
import * as nominationsRoute from "./theatres/[theatreId]/nominations/route";
import * as nomcomsRoute from "./theatres/[theatreId]/nomcoms/route";
import * as seenRoute from "./theatres/[theatreId]/seen/route";
import * as rotateInviteRoute from "./theatres/[theatreId]/invite/rotate/route";
import * as joinRoute from "./join/[code]/route";

// Auth is the one thing stubbed; everything below it runs for real.
const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    currentUserId.value ? { user: { id: currentUserId.value } } : null,
}));

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const MALLORY = "33333333-3333-3333-3333-333333333333";

const asUser = (id: string) => {
  currentUserId.value = id;
};

interface Fixture {
  db: DB;
  theatreA: { id: string };
  theatreB: { id: string };
  nominationInA: number;
  nominationInB: number;
  movieInA: number;
  movieInB: number;
}

let fixture: Fixture;

const route = (theatre: "club" | "secret" = "club") => ({
  params: Promise.resolve({
    theatreId: theatre === "club" ? fixture.theatreA.id : fixture.theatreB.id,
  }),
});
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

  const [theatreA] = await db
    .insert(theatres)
    .values({
      name: "Club",
      createdBy: ALICE,
      inviteCode: "invite-a",
      adminInviteCode: "invite-a-admin",
    })
    .returning();

  const [theatreB] = await db
    .insert(theatres)
    .values({
      name: "Club",
      createdBy: MALLORY,
      inviteCode: "invite-b",
      adminInviteCode: "invite-b-admin",
    })
    .returning();

  await db.insert(theatreMembers).values([
    { theatreId: theatreA.id, userId: ALICE, role: "admin" },
    { theatreId: theatreA.id, userId: BOB, role: "member" },
    { theatreId: theatreB.id, userId: MALLORY, role: "admin" },
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
      theatreId: theatreA.id,
      userId: ALICE,
      movieId: insertedMovies[0].id,
    })
    .returning();

  const [nomB] = await db
    .insert(nominations)
    .values({
      theatreId: theatreB.id,
      userId: MALLORY,
      movieId: insertedMovies[1].id,
    })
    .returning();

  await db.insert(seen).values([
    { movieId: insertedMovies[1].id, userId: MALLORY },
    // A public list shows seen marks from everyone, not only its members.
    { movieId: insertedMovies[0].id, userId: MALLORY },
  ]);

  fixture = {
    db: db as unknown as DB,
    theatreA,
    theatreB,
    nominationInA: nomA.id,
    nominationInB: nomB.id,
    movieInA: insertedMovies[0].id,
    movieInB: insertedMovies[1].id,
  };
});

describe("theatre membership", () => {
  it("resolves theatres by ID even when their names match", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const aliceClub = await GET(new Request("http://test"), route("club"));
    const malloryClub = await GET(new Request("http://test"), route("secret"));

    expect(await aliceClub.json()).toHaveLength(1);
    expect(malloryClub.status).toBe(200);
  });

  it("returns only the caller's own theatre contents", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const response = await GET(new Request("http://test"), route("club"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].movie.details.title).toBe("Public Movie");
  });

  it("shows a theatre the caller does not belong to", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const response = await GET(new Request("http://test"), route("secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
  });

  it("allows anonymous callers to read list contents", async () => {
    const { GET } = nominationsRoute;
    asUser("");

    const response = await GET(new Request("http://test"), route("club"));
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveLength(1);
  });

  it("lists only the caller's theatres for personal navigation", async () => {
    const { GET } = theatresRoute;
    asUser(BOB);

    const body = await (await GET(new Request("http://test"))).json();
    expect(body.map((theatre: { id: string }) => theatre.id))
      .toEqual([fixture.theatreA.id]);
  });

  it.each(["", MALLORY])("returns creator IDs but no membership details or invite codes to public viewers (%s)", async (userId) => {
    const { GET } = theatreRoute;
    asUser(userId);
    const body = await (
      await GET(new Request("http://test"), route("club"))
    ).json();

    expect(body).toEqual({
      theatre: expect.objectContaining({
        name: "Club",
        createdBy: ALICE,
        watchlistFor: null,
      }),
      membership: null,
      tags: [],
    });
    expect(JSON.stringify(body)).not.toContain("email");
    expect(JSON.stringify(body)).not.toContain("invite-a");
  });
});

describe("cross-theatre writes", () => {
  it("cannot comment on another theatre's nomination", async () => {
    const { POST } = nomcomsRoute;
    asUser(BOB);

    const response = await POST(
      post({ nominationId: fixture.nominationInB, comment: "hello" }),
      route("club"),
    );

    expect(response.status).toBe(404);
    expect(await fixture.db.select().from(nomcoms)).toHaveLength(0);
  });

  it("lets signed-in nonmembers comment without joining", async () => {
    const { POST } = nomcomsRoute;
    asUser(MALLORY);
    const response = await POST(
      post({ nominationId: fixture.nominationInA, comment: "Looks good." }),
      route("club"),
    );
    expect(response.status).toBe(201);
    expect(
      (await fixture.db.select().from(theatreMembers)).some(
        (member) =>
          member.theatreId === fixture.theatreA.id &&
          member.userId === MALLORY,
      ),
    ).toBe(false);
  });

  it("cannot delete another theatre's nomination", async () => {
    const { DELETE } = nominationsRoute;
    asUser(BOB);

    const response = await DELETE(
      new Request(`http://test/api?id=${fixture.nominationInB}`, {
        method: "DELETE",
      }),
      route("club"),
    );

    expect(response.status).toBe(403);
    expect(await fixture.db.select().from(nominations)).toHaveLength(2);
  });

  it("cannot delete someone else's nomination in its own theatre", async () => {
    const { DELETE } = nominationsRoute;
    asUser(BOB);

    const response = await DELETE(
      new Request(`http://test/api?id=${fixture.nominationInA}`, {
        method: "DELETE",
      }),
      route("club"),
    );

    expect(response.status).toBe(403);
  });

  it("lets a nominator update and clear their own nomination comment", async () => {
    const { PATCH } = nominationsRoute;
    asUser(ALICE);

    const updated = await PATCH(
      post({ id: fixture.nominationInA, comment: "  Please watch this.  " }),
      route("club"),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).comment).toBe("Please watch this.");

    const cleared = await PATCH(
      post({ id: fixture.nominationInA, comment: "   " }),
      route("club"),
    );
    expect(cleared.status).toBe(200);

    const [row] = await fixture.db
      .select()
      .from(nominations)
      .where(eq(nominations.id, fixture.nominationInA));
    expect(row.comment).toBeNull();
  });

  it("cannot update someone else's nomination in its own theatre", async () => {
    const { PATCH } = nominationsRoute;
    asUser(BOB);

    const response = await PATCH(
      post({ id: fixture.nominationInA, comment: "mine now" }),
      route("club"),
    );

    expect(response.status).toBe(403);
    const [row] = await fixture.db
      .select()
      .from(nominations)
      .where(eq(nominations.id, fixture.nominationInA));
    expect(row.comment).toBeNull();
  });

  it("cannot update another theatre's nomination through its own theatre", async () => {
    const { PATCH } = nominationsRoute;
    asUser(BOB);

    const response = await PATCH(
      post({ id: fixture.nominationInB, comment: "hello" }),
      route("club"),
    );

    expect(response.status).toBe(403);
  });

  it("lets a commenter update their own discussion comment", async () => {
    const { PATCH } = nomcomsRoute;
    const [comment] = await fixture.db
      .insert(nomcoms)
      .values({
        theatreId: fixture.theatreA.id,
        userId: BOB,
        nominationId: fixture.nominationInA,
        comment: "old take",
      })
      .returning();
    asUser(BOB);

    const response = await PATCH(
      post({ id: comment.id, comment: "  new take  " }),
      route("club"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.nomcoms[0].comment).toBe("new take");
  });

  it("keeps discussion comments required when editing", async () => {
    const { PATCH } = nomcomsRoute;
    const [comment] = await fixture.db
      .insert(nomcoms)
      .values({
        theatreId: fixture.theatreA.id,
        userId: BOB,
        nominationId: fixture.nominationInA,
        comment: "old take",
      })
      .returning();
    asUser(BOB);

    const response = await PATCH(
      post({ id: comment.id, comment: " " }),
      route("club"),
    );

    expect(response.status).toBe(400);
    const [row] = await fixture.db
      .select()
      .from(nomcoms)
      .where(eq(nomcoms.id, comment.id));
    expect(row.comment).toBe("old take");
  });

  it("cannot update another theatre's discussion comment", async () => {
    const { PATCH } = nomcomsRoute;
    const [comment] = await fixture.db
      .insert(nomcoms)
      .values({
        theatreId: fixture.theatreB.id,
        userId: MALLORY,
        nominationId: fixture.nominationInB,
        comment: "secret take",
      })
      .returning();
    asUser(BOB);

    const response = await PATCH(
      post({ id: comment.id, comment: "not secret anymore" }),
      route("club"),
    );

    expect(response.status).toBe(404);
    const [row] = await fixture.db
      .select()
      .from(nomcoms)
      .where(eq(nomcoms.id, comment.id));
    expect(row.comment).toBe("secret take");
  });

  it("shows a non-member's viewing on a public list", async () => {
    const { GET } = nominationsRoute;
    asUser(BOB);

    const body = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(body[0].seenBy).toEqual([{ id: MALLORY, name: "Mallory" }]);
  });

  it("lets any signed-in viewer mark a movie seen without joining", async () => {
    const { POST } = seenRoute;
    const { GET } = nominationsRoute;
    asUser(MALLORY);

    const marked = await POST(
      post({ movieId: fixture.movieInA }),
      route("club"),
    );
    expect(marked.status).toBe(201);

    const body = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(body[0].seenBy.map((user: { id: string }) => user.id)).toEqual([
      MALLORY,
    ]);
    expect(
      (await fixture.db.select().from(theatreMembers)).some(
        (member) =>
          member.theatreId === fixture.theatreA.id &&
          member.userId === MALLORY,
      ),
    ).toBe(false);
  });

  it("refuses to mark a movie that is not on the acting theatre's list", async () => {
    const { POST } = seenRoute;
    asUser(BOB);

    const response = await POST(
      post({ movieId: fixture.movieInB }),
      route("club"),
    );

    expect(response.status).toBe(404);
    // Theatre B's own marking is untouched, and nothing was recorded for Bob.
    const rows = await fixture.db.select().from(seen);
    expect(rows.filter((row) => row.userId === BOB)).toHaveLength(0);
  });
});

describe("admin-only routes", () => {
  it("refuses a rename from a non-admin member", async () => {
    const { PATCH } = theatreRoute;
    asUser(BOB);

    const response = await PATCH(post({ name: "Hijacked" }), route("club"));
    expect(response.status).toBe(403);

    const [theatre] = await fixture.db
      .select()
      .from(theatres)
      .where(eq(theatres.id, fixture.theatreA.id));
    expect(theatre.name).toBe("Club");
  });

  it("allows an admin to rename the theatre", async () => {
    const { PATCH } = theatreRoute;
    asUser(ALICE);

    const response = await PATCH(post({ name: "Renamed" }), route("club"));
    expect(response.status).toBe(200);
  });

  it("refuses a non-member entirely", async () => {
    const { PATCH } = theatreRoute;
    asUser(MALLORY);

    const response = await PATCH(post({ name: "Hijacked" }), route("club"));
    expect(response.status).toBe(404);
  });

  it("shares the member invite with members but keeps the admin invite private", async () => {
    const { GET } = theatreRoute;
    asUser(BOB);
    const asMember = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(asMember.inviteCode).toBe("invite-a");
    expect(asMember.adminInviteCode).toBeUndefined();
    // The embedded theatre object must not smuggle it through either.
    expect(asMember.theatre.inviteCode).toBeUndefined();
    expect(asMember.theatre.adminInviteCode).toBeUndefined();
    expect(JSON.stringify(asMember)).not.toContain("invite-a-admin");

    asUser(ALICE);
    const asAdmin = await (
      await GET(new Request("http://test"), route("club"))
    ).json();
    expect(asAdmin.inviteCode).toBe("invite-a");
    expect(asAdmin.adminInviteCode).toBe("invite-a-admin");
  });

  it("keeps the invite code out of the server-rendered theatre payload", async () => {
    asUser(BOB);

    const result = await loadTheatre(fixture.theatreA.id);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // This object is serialized into the RSC payload for every member.
    expect(JSON.stringify(result.data.theatre)).not.toContain("invite-a");
  });

  it("does not leak the invite code through a rename", async () => {
    const { PATCH } = theatreRoute;
    asUser(ALICE);

    const body = await (
      await PATCH(post({ name: "Renamed" }), route("club"))
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

  it("adds the caller to the theatre behind the code", async () => {
    const { POST } = joinRoute;
    asUser(BOB);

    const response = await POST(
      new Request("http://test", { method: "POST" }),
      {
        params: Promise.resolve({ code: "invite-b" }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      path: `/theatres/${fixture.theatreB.id}`,
    });
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

    const members = await fixture.db.select().from(theatreMembers);
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

  it("adds the caller to the theatre as an admin via the admin invite code", async () => {
    const { POST } = joinRoute;
    asUser(BOB);

    const response = await POST(
      new Request("http://test", { method: "POST" }),
      { params: Promise.resolve({ code: "invite-b-admin" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      path: `/theatres/${fixture.theatreB.id}`,
    });

    const [membership] = await fixture.db
      .select()
      .from(theatreMembers)
      .where(
        and(
          eq(theatreMembers.userId, BOB),
          eq(
            theatreMembers.theatreId,
            (
              await fixture.db
                .select({ id: theatres.id })
                .from(theatres)
                .where(eq(theatres.id, fixture.theatreB.id))
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
