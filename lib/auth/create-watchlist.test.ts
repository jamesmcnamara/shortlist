import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { theatres, theatreMembers } from "@/src/db/schema";
import { createWatchlist } from "./create-watchlist";

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
let fixture: Awaited<ReturnType<typeof createTestDb>>;

beforeEach(async () => {
  fixture = await createTestDb();
  setDbForTesting(() => fixture.db as unknown as DB);
  await fixture.db.insert(authUsers).values([
    { id: ALICE, name: "Alice", email: "alice@example.com" },
    { id: BOB, name: "Bob", email: "bob@example.com" },
  ]);
});

afterEach(async () => {
  setDbForTesting(null);
  await fixture.client.close();
});

describe("default watchlists", () => {
  it("creates a distinct watchlist and admin membership for each user", async () => {
    await Promise.all([createWatchlist(ALICE), createWatchlist(BOB)]);
    const lists = await fixture.db.select().from(theatres);
    expect(lists).toHaveLength(2);
    expect(lists.map((theatre) => theatre.watchlistFor).sort()).toEqual([ALICE, BOB]);
    expect(lists.every((theatre) => theatre.name === "Watchlist")).toBe(true);
    const memberships = await fixture.db.select().from(theatreMembers);
    expect(memberships).toHaveLength(2);
    lists.forEach((theatre) => {
      expect(memberships).toContainEqual(expect.objectContaining({
        theatreId: theatre.id, userId: theatre.watchlistFor, role: "admin",
      }));
    }, 15_000);
  });

  it("is safe to retry concurrently without replacing a renamed theatre or its links", async () => {
    await createWatchlist(ALICE);
    await fixture.db.update(theatres).set({ name: "My movies" });
    const [before] = await fixture.db.select().from(theatres);
    await Promise.all([createWatchlist(ALICE), createWatchlist(ALICE)]);
    expect(await fixture.db.select().from(theatres)).toEqual([before]);
    expect(await fixture.db.select().from(theatreMembers)).toHaveLength(1);
  });

  it("rolls back theatre creation if membership creation fails", async () => {
    await fixture.client.exec(`
      ALTER TABLE theatre_members ADD CONSTRAINT reject_test_admin CHECK (role <> 'admin');
    `);
    await expect(createWatchlist(ALICE)).rejects.toThrow();
    expect(await fixture.db.select().from(theatres)).toEqual([]);
  });

  it("backfills existing users without treating ordinary Watchlist theatres as defaults", async () => {
    const [ordinary] = await fixture.db.insert(theatres).values({
      name: "Watchlist", createdBy: ALICE, inviteCode: "existing",
      adminInviteCode: "existing-admin",
    }).returning();
    await fixture.client.exec('ALTER TABLE theatres DROP COLUMN watchlist_for CASCADE');
    const migration = (await readFile("drizzle/0020_loud_captain_flint.sql", "utf8"))
      .replaceAll('"rooms"', '"theatres"')
      .replaceAll('"room_members"', '"theatre_members"')
      .replaceAll('"room_id"', '"theatre_id"');
    await fixture.client.exec(migration);
    const lists = await fixture.db.select().from(theatres);
    expect(lists).toHaveLength(3);
    expect(lists.find((theatre) => theatre.id === ordinary.id)?.watchlistFor).toBeNull();
    expect(await fixture.db.select().from(theatreMembers)).toHaveLength(2);

    const backfill = migration.slice(migration.indexOf('INSERT INTO "theatres"'));
    await fixture.client.exec(backfill);
    expect(await fixture.db.select().from(theatres)).toEqual(lists);
    const aliceMemberships = await fixture.db.select().from(theatreMembers)
      .where(eq(theatreMembers.userId, ALICE));
    expect(aliceMemberships).toHaveLength(1);
    expect(aliceMemberships[0].role).toBe("admin");
  });

  it("creates the watchlist through the auth user-creation hook", async () => {
    await fixture.client.exec(`
      ALTER TABLE neon_auth."user" ALTER COLUMN id SET DEFAULT gen_random_uuid();
    `);
    const { auth } = await import("./server");
    const context = await auth.$context;
    const user = await context.internalAdapter.createUser({
      name: "New user", email: "new@example.com", emailVerified: false,
    });
    const [watchlist] = await fixture.db.select().from(theatres)
      .where(eq(theatres.watchlistFor, user.id));
    expect(watchlist.name).toBe("Watchlist");
    expect(watchlist.createdBy).toBe(user.id);
    expect(await fixture.db.select().from(theatreMembers)).toEqual([
      expect.objectContaining({
        theatreId: watchlist.id, userId: user.id, role: "admin",
      }),
    ]);
  }, 30_000);
});
