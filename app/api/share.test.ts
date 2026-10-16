import { beforeEach, describe, expect, it, vi } from "vitest";
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
import * as shareRoute from "./share/[code]/route";
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

const get = (path = "http://test/api") => new Request(path);
const share = (code: string) =>
  shareRoute.GET(get(), { params: Promise.resolve({ code }) });
const asTheatre = (theatreId: string) => ({
  params: Promise.resolve({ theatreId }),
});

beforeEach(async () => {
  currentUserId.value = "";
  const { db } = await createTestDb();
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

describe("share codes", () => {
  it("are generated for every theatre and are unique", () => {
    expect(club.shareCode).toMatch(/^[0-9a-f]{32}$/);
    expect(secret.shareCode).toMatch(/^[0-9a-f]{32}$/);
    expect(club.shareCode).not.toBe(secret.shareCode);
  });

  it("are given to any member, not just admins", async () => {
    currentUserId.value = BOB;
    const response = await theatreRoute.GET(get(), asTheatre(club.id));
    expect((await response.json()).shareCode).toBe(club.shareCode);
  });

  it("stay out of theatre updates", async () => {
    currentUserId.value = ALICE;
    const response = await theatreRoute.PATCH(
      new Request("http://test/api", {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
      asTheatre(club.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("shareCode");
  });
});

describe("GET /api/share/[code]", () => {
  it("shows a theatre to signed-out visitors", async () => {
    const response = await share(club.shareCode);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.theatre).toEqual({ name: "Club" });
    expect(body.nominations).toHaveLength(1);
    const [nom] = body.nominations;
    expect(nom.movie.details.title).toBe("Shared");
    expect(nom.nominator).toEqual({ id: ALICE, name: "Alice" });
    expect(nom.nomcoms[0].commenter).toEqual({ id: BOB, name: "Bob" });
    expect(nom.seenBy).toEqual([{ id: BOB, name: "Bob" }]);
  });

  it("never leaks emails or invite codes", async () => {
    const text = await (await share(club.shareCode)).text();
    expect(text).not.toMatch(/@example\.com|email/i);
    expect(text).not.toMatch(/invite|shareCode/i);
    expect(text).not.toContain(club.shareCode);
  });

  it("404s for unknown or malformed codes", async () => {
    const statuses = await Promise.all(
      ["0".repeat(32), "nope", club.id, "invite-a", ""].map(
        async (code) => (await share(code)).status,
      ),
    );
    expect(statuses).toEqual([404, 404, 404, 404, 404]);
  });

  it("doesn't open member-only routes", async () => {
    const response = await nominationsRoute.GET(
      get(),
      asTheatre(club.shareCode),
    );
    expect(response.status).toBe(401);
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
