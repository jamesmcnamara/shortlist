import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { setDbForTesting, type DB } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { rooms, roomMembers } from "@/src/db/schema";
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
    const lists = await fixture.db.select().from(rooms);
    expect(lists).toHaveLength(2);
    expect(lists.map((room) => room.watchlistFor).sort()).toEqual([ALICE, BOB]);
    expect(lists.every((room) => room.name === "Watchlist")).toBe(true);
    const memberships = await fixture.db.select().from(roomMembers);
    expect(memberships).toHaveLength(2);
    lists.forEach((room) => {
      expect(memberships).toContainEqual(expect.objectContaining({
        roomId: room.id, userId: room.watchlistFor, role: "admin",
      }));
    }, 15_000);
  });

  it("is safe to retry concurrently without replacing a renamed room or its links", async () => {
    await createWatchlist(ALICE);
    await fixture.db.update(rooms).set({ name: "My movies" });
    const [before] = await fixture.db.select().from(rooms);
    await Promise.all([createWatchlist(ALICE), createWatchlist(ALICE)]);
    expect(await fixture.db.select().from(rooms)).toEqual([before]);
    expect(await fixture.db.select().from(roomMembers)).toHaveLength(1);
  });

  it("rolls back room creation if membership creation fails", async () => {
    await fixture.client.exec(`
      ALTER TABLE room_members ADD CONSTRAINT reject_test_admin CHECK (role <> 'admin');
    `);
    await expect(createWatchlist(ALICE)).rejects.toThrow();
    expect(await fixture.db.select().from(rooms)).toEqual([]);
  });

  it("backfills existing users without treating ordinary Watchlist rooms as defaults", async () => {
    const [ordinary] = await fixture.db.insert(rooms).values({
      name: "Watchlist", createdBy: ALICE, inviteCode: "existing",
      adminInviteCode: "existing-admin",
    }).returning();
    await fixture.client.exec('ALTER TABLE rooms DROP COLUMN watchlist_for CASCADE');
    const migration = await readFile("drizzle/0020_loud_captain_flint.sql", "utf8");
    await fixture.client.exec(migration);
    const lists = await fixture.db.select().from(rooms);
    expect(lists).toHaveLength(3);
    expect(lists.find((room) => room.id === ordinary.id)?.watchlistFor).toBeNull();
    expect(await fixture.db.select().from(roomMembers)).toHaveLength(2);

    const backfill = migration.slice(migration.indexOf('INSERT INTO "rooms"'));
    await fixture.client.exec(backfill);
    expect(await fixture.db.select().from(rooms)).toEqual(lists);
    const aliceMemberships = await fixture.db.select().from(roomMembers)
      .where(eq(roomMembers.userId, ALICE));
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
    const [watchlist] = await fixture.db.select().from(rooms)
      .where(eq(rooms.watchlistFor, user.id));
    expect(watchlist.name).toBe("Watchlist");
    expect(watchlist.createdBy).toBe(user.id);
    expect(await fixture.db.select().from(roomMembers)).toEqual([
      expect.objectContaining({
        roomId: watchlist.id, userId: user.id, role: "admin",
      }),
    ]);
  });
});
