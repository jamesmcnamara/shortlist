import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/src/db/test-db";
import { authUsers } from "@/src/db/neon-auth-schema";
import { movies, nominations, theatres } from "@/src/db/schema";

const USER = "11111111-1111-1111-1111-111111111111";
let fixture: Awaited<ReturnType<typeof createTestDb>>;
let theatreId: string;
let movieId: number;
const stored = async () => {
  const [theatre] = await fixture.db
    .select()
    .from(theatres)
    .where(eq(theatres.id, theatreId));
  return theatre;
};
beforeEach(async () => {
  fixture = await createTestDb();
  await fixture.db
    .insert(authUsers)
    .values({ id: USER, name: "User", email: "user@test.com" });
  const [theatre] = await fixture.db
    .insert(theatres)
    .values({
      name: "Club",
      createdBy: USER,
      inviteCode: "member",
      adminInviteCode: "admin",
      createdAt: new Date("2020-01-01"),
      updatedAt: new Date("2020-01-01"),
    })
    .returning();
  theatreId = theatre.id;
  const [movie] = await fixture.db
    .insert(movies)
    .values({ details: {}, ratings: {} })
    .returning();
  movieId = movie.id;
});
afterEach(async () => fixture.client.close());

it("advances real metadata changes only and never moves backwards", async () => {
  const original = (await stored()).updatedAt;
  await fixture.db
    .update(theatres)
    .set({ name: "Club", description: null })
    .where(eq(theatres.id, theatreId));
  expect((await stored()).updatedAt).toEqual(original);
  await fixture.db
    .update(theatres)
    .set({ inviteCode: "rotated" })
    .where(eq(theatres.id, theatreId));
  expect((await stored()).updatedAt).toEqual(original);
  await fixture.db
    .update(theatres)
    .set({ description: "#horror" })
    .where(eq(theatres.id, theatreId));
  expect((await stored()).updatedAt.getTime()).toBeGreaterThan(
    original.getTime(),
  );
  const future = new Date("2100-01-01");
  await fixture.db
    .update(theatres)
    .set({ updatedAt: future })
    .where(eq(theatres.id, theatreId));
  await fixture.db
    .update(theatres)
    .set({ name: "New name" })
    .where(eq(theatres.id, theatreId));
  expect((await stored()).updatedAt).toEqual(future);
});

it("tracks adds and removals but not duplicates, nomination edits or failed writes", async () => {
  const original = (await stored()).updatedAt;
  const [nomination] = await fixture.db
    .insert(nominations)
    .values({
      theatreId,
      userId: USER,
      movieId,
    })
    .returning();
  const added = (await stored()).updatedAt;
  expect(added.getTime()).toBeGreaterThan(original.getTime());
  await fixture.db
    .insert(nominations)
    .values({ theatreId, userId: USER, movieId })
    .onConflictDoNothing();
  await fixture.db
    .update(nominations)
    .set({ comment: "Edited", completed: true })
    .where(eq(nominations.id, nomination.id));
  expect((await stored()).updatedAt).toEqual(added);
  await expect(
    fixture.db.insert(nominations).values({
      theatreId,
      userId: USER,
      movieId: 99999,
    }),
  ).rejects.toThrow();
  expect((await stored()).updatedAt).toEqual(added);
  await fixture.db.delete(nominations).where(eq(nominations.id, nomination.id));
  expect((await stored()).updatedAt.getTime()).toBeGreaterThanOrEqual(
    added.getTime(),
  );
});

it("rolls timestamps back with the mutation and supports cascading theatre deletion", async () => {
  const original = (await stored()).updatedAt;
  await expect(
    fixture.db.transaction(async (tx) => {
      await tx.insert(nominations).values({ theatreId, userId: USER, movieId });
      throw new Error("rollback");
    }),
  ).rejects.toThrow("rollback");
  expect((await stored()).updatedAt).toEqual(original);
  await fixture.db
    .insert(nominations)
    .values({ theatreId, userId: USER, movieId });
  await fixture.db.delete(theatres).where(eq(theatres.id, theatreId));
  expect(await stored()).toBeUndefined();
});

it("backfills from historical creation/nomination dates rather than migration time", async () => {
  await fixture.db.insert(nominations).values({
    theatreId,
    userId: USER,
    movieId,
    createdAt: new Date("2021-01-01"),
  });
  await fixture.client.exec(`
    DROP TRIGGER theatre_metadata_updated ON theatres;
    DROP TRIGGER theatre_nominations_updated ON nominations;
    DROP FUNCTION touch_theatre_metadata();
    DROP FUNCTION touch_theatre_nominations();
    ALTER TABLE theatres DROP COLUMN updated_at;
  `);
  const migration = await readFile("drizzle/0026_rainy_jetstream.sql", "utf8");
  await fixture.client.exec(migration);
  expect((await stored()).updatedAt).toEqual(new Date("2021-01-01"));
  const [empty] = await fixture.db
    .insert(theatres)
    .values({
      name: "Empty",
      createdBy: USER,
      inviteCode: "empty",
      adminInviteCode: "empty-admin",
      createdAt: new Date("2022-01-01"),
    })
    .returning();
  expect(empty.updatedAt.getTime()).toBeGreaterThanOrEqual(
    empty.createdAt.getTime(),
  );
});
