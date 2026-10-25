import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import {
  movies,
  nominations,
  nomcoms,
  seen,
  theatres,
  theatreMembers,
} from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import * as joinRoute from "./join/[code]/route";
import * as rotateRoute from "./theatres/[theatreId]/invite/rotate/route";
import * as theatreRoute from "./theatres/[theatreId]/route";
import * as nominationsRoute from "./theatres/[theatreId]/nominations/route";

const currentUserId = vi.hoisted(() => ({ value: "" }));
vi.mock("@/lib/auth/server", () => ({
  getSession: async () =>
    currentUserId.value ? { user: { id: currentUserId.value } } : null,
}));

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";

let club: typeof theatres.$inferSelect;
let secret: typeof theatres.$inferSelect;
let fixture: Awaited<ReturnType<typeof createTestDb>>;

const get = (path = "http://test/api") => new Request(path);
const preview = (code: string) =>
  joinRoute.GET(get(), { params: Promise.resolve({ code }) });
const join = (code: string) =>
  joinRoute.POST(new Request("http://test/api", { method: "POST" }), {
    params: Promise.resolve({ code }),
  });
const asTheatre = (theatreId: string) => ({
  params: Promise.resolve({ theatreId }),
});

beforeEach(async () => {
  currentUserId.value = "";
  fixture = await createTestDb();
  const { db } = fixture;
  setDbForTesting(() => db as unknown as DB);

  await db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);

  [club, secret] = await db
    .insert(theatres)
    .values([
      {
        name: "Club",
        createdBy: ALICE,
        inviteCode: "invite-a",
        adminInviteCode: "invite-a-admin",
      },
      {
        name: "Secret",
        createdBy: BOB,
        inviteCode: "invite-b",
        adminInviteCode: "invite-b-admin",
      },
    ])
    .returning();

  await db.insert(theatreMembers).values([
    { theatreId: club.id, userId: ALICE, role: "admin" },
    { theatreId: club.id, userId: BOB, role: "member" },
    { theatreId: secret.id, userId: BOB, role: "admin" },
  ]);

  const [movie, other] = await db
    .insert(movies)
    .values([
      { tmdbId: 1, details: { title: "Shared" }, ratings: { services: [], raw: {} } },
      { tmdbId: 2, details: { title: "Hidden" }, ratings: { services: [], raw: {} } },
    ])
    .returning();

  const [nom] = await db
    .insert(nominations)
    .values([
      { theatreId: club.id, userId: ALICE, movieId: movie.id, comment: "Hi" },
      { theatreId: secret.id, userId: BOB, movieId: other.id },
    ])
    .returning();

  await db.insert(nomcoms).values({
    theatreId: club.id,
    nominationId: nom.id,
    userId: BOB,
    comment: "Yes",
  });
  await db.insert(seen).values({ movieId: movie.id, userId: BOB });
});

afterEach(async () => {
  setDbForTesting(null);
  await fixture.client.close();
});

describe("member invite sharing", () => {
  it("gives the member invite to any member, but withholds the admin invite", async () => {
    currentUserId.value = BOB;
    const response = await theatreRoute.GET(get(), asTheatre(club.id));
    const body = await response.json();
    expect(body.inviteCode).toBe(club.inviteCode);
    expect(body.adminInviteCode).toBeUndefined();
    expect(body.theatre).not.toHaveProperty("inviteCode");
    expect(body.theatre).not.toHaveProperty("adminInviteCode");
  });

  it("keeps codes out of theatre updates", async () => {
    currentUserId.value = ALICE;
    const response = await theatreRoute.PATCH(
      new Request("http://test/api", {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
      asTheatre(club.id),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("inviteCode");
    expect(body).not.toHaveProperty("adminInviteCode");
  });
});

describe("GET /api/join/[code]", () => {
  it.each(["inviteCode", "adminInviteCode"] as const)(
    "shows a theatre to signed-out visitors using %s",
    async (kind) => {
      const response = await preview(club[kind]);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.theatre).toEqual({ name: "Club" });
      expect(body.nominations).toHaveLength(1);
      const [nom] = body.nominations;
      expect(nom.movie.details.title).toBe("Shared");
      expect(nom.nominator).toEqual({ id: ALICE, name: "Alice" });
      expect(nom.nomcoms[0].commenter).toEqual({ id: BOB, name: "Bob" });
      expect(nom.seenBy).toEqual([{ id: BOB, name: "Bob" }]);
    },
  );

  it.each(["inviteCode", "adminInviteCode"] as const)(
    "never leaks emails or codes through %s",
    async (kind) => {
      const text = await (await preview(club[kind])).text();
      expect(text).not.toMatch(/@example\.com|email/i);
      expect(text).not.toMatch(/invite|shareCode/i);
      expect(text).not.toContain(club.inviteCode);
      expect(text).not.toContain(club.adminInviteCode);
      expect(text).not.toContain(secret.name);
    },
  );

  it("404s for unknown or malformed codes", async () => {
    const statuses = await Promise.all(
      ["0".repeat(32), "nope", club.id, "../", ""].map(
        async (code) => (await preview(code)).status,
      ),
    );
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
  });

  it("does not resolve an invite code as a theatre ID", async () => {
    const response = await nominationsRoute.GET(
      get(),
      asTheatre(club.inviteCode),
    );
    expect(response.status).toBe(404);
  });

  it("does not create or upgrade memberships, even for signed-in viewers", async () => {
    const members = await fixture.db.select().from(theatreMembers);
    await preview(secret.inviteCode);
    currentUserId.value = BOB;
    await preview(club.adminInviteCode);
    expect(await fixture.db.select().from(theatreMembers)).toEqual(members);
  });

  it("keeps reads isolated to the theatre behind the invite", async () => {
    const body = await (await preview(secret.inviteCode)).json();
    expect(body.theatre).toEqual({ name: "Secret" });
    expect(body.nominations).toHaveLength(1);
    expect(body.nominations[0].movie.details.title).toBe("Hidden");
  });

  it.each(["member", "admin"] as const)(
    "revokes both preview and join when the %s invite rotates",
    async (kind) => {
      currentUserId.value = ALICE;
      const oldCode = kind === "admin" ? club.adminInviteCode : club.inviteCode;
      const otherCode = kind === "admin" ? club.inviteCode : club.adminInviteCode;
      const response = await rotateRoute.POST(
        new Request("http://test/api", {
          method: "POST",
          body: JSON.stringify({ kind }),
        }),
        asTheatre(club.id),
      );
      expect(response.status).toBe(200);
      const codes = await response.json();
      const newCode = kind === "admin" ? codes.adminInviteCode : codes.inviteCode;

      currentUserId.value = "";
      expect((await preview(oldCode)).status).toBe(404);
      expect((await preview(newCode)).status).toBe(200);
      expect((await preview(otherCode)).status).toBe(200);
      currentUserId.value = BOB;
      expect((await join(oldCode)).status).toBe(404);
      expect((await join(newCode)).status).toBe(200);
    },
  );
});

describe("POST /api/join/[code]", () => {
  it("requires authentication even when the preview is public", async () => {
    const members = await fixture.db.select().from(theatreMembers);
    expect((await join(club.inviteCode)).status).toBe(401);
    expect((await join(club.adminInviteCode)).status).toBe(401);
    expect(await fixture.db.select().from(theatreMembers)).toEqual(members);
  });

  it("does not downgrade an admin using the member invite", async () => {
    currentUserId.value = ALICE;
    expect((await join(club.inviteCode)).status).toBe(200);
    const [membership] = await fixture.db
      .select()
      .from(theatreMembers)
      .where(eq(theatreMembers.userId, ALICE));
    expect(membership.role).toBe("admin");
  });
});

describe("member payloads", () => {
  it("drop emails from nominations", async () => {
    currentUserId.value = ALICE;
    const response = await nominationsRoute.GET(get(), asTheatre(club.id));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/@example\.com|email/i);
  });
});
