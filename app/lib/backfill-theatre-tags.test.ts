import { afterEach, beforeEach, expect, it } from "vitest";
import { createTestDb } from "@/src/db/test-db";
import { authUsers } from "@/src/db/neon-auth-schema";
import { tags, theatres, theatreTags } from "@/src/db/schema";
import { backfillTheatreTags } from "../../scripts/backfill-theatre-tags.mjs";

const USER = "11111111-1111-1111-1111-111111111111";
let fixture: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  fixture = await createTestDb();
  await fixture.db
    .insert(authUsers)
    .values({ id: USER, name: "User", email: "user@test.com" });
  await fixture.db.insert(theatres).values({
    name: "Club",
    createdBy: USER,
    inviteCode: "member",
    adminInviteCode: "admin",
    description: "#CAFÉ #cafe\u0301 #2026 #date-night word#no https://test/#no",
    updatedAt: new Date("2020-01-01"),
  });
});
afterEach(async () => fixture.client.close());

function testSql() {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce(
      (text, part, index) => text + (index ? `$${index}` : "") + part,
      "",
    );
    return {
      text,
      values,
      then: <T>(resolve: (rows: unknown[]) => T) =>
        fixture.client.query(text, values).then(({ rows }) => resolve(rows)),
    };
  };
  sql.transaction = async (queries: ReturnType<typeof sql>[]) =>
    fixture.client.transaction(async (tx) => {
      for (const { text, values } of queries) await tx.query(text, values);
    });
  return sql;
}

it("dry-runs, backfills with the shared grammar, removes stale tags and is repeatable", async () => {
  const [theatre] = await fixture.db.select().from(theatres);
  await fixture.db.insert(tags).values({ name: "stale" });
  await fixture.db
    .insert(theatreTags)
    .values({ theatreId: theatre.id, tag: "stale" });
  const sql = testSql();
  expect(await backfillTheatreTags(sql)).toBe(1);
  expect(await fixture.db.select().from(theatreTags)).toHaveLength(1);
  await backfillTheatreTags(sql, true);
  await backfillTheatreTags(sql, true);
  expect(
    (await fixture.db.select().from(theatreTags).orderBy(theatreTags.tag)).map(
      ({ tag }) => tag,
    ),
  ).toEqual(["2026", "café", "date-night"]);
  expect((await fixture.db.select().from(theatres))[0]).toEqual(theatre);
  expect(await fixture.db.select().from(tags)).toContainEqual({
    name: "stale",
  });
});

it("does not overwrite tags when a description changes after its initial read", async () => {
  const sql = testSql();
  const transaction = sql.transaction;
  sql.transaction = async (queries) => {
    await fixture.client.exec(`
      UPDATE theatres SET description = '#new';
      INSERT INTO tags (name) VALUES ('new');
      INSERT INTO theatre_tags (theatre_id, tag) SELECT id, 'new' FROM theatres;
    `);
    return transaction(queries);
  };
  await backfillTheatreTags(sql, true);
  expect(
    (await fixture.db.select().from(theatreTags)).map(({ tag }) => tag),
  ).toEqual(["new"]);
});
