import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("backfills existing users and duplicate theatre names without changing existing data", async () => {
  const client = new PGlite();
  try {
    await client.exec(`
      CREATE SCHEMA neon_auth;
      CREATE TABLE neon_auth."user" (
        id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL,
        "createdAt" timestamptz NOT NULL
      );
      CREATE TABLE theatres (
        id uuid PRIMARY KEY, name text NOT NULL, created_by uuid NOT NULL,
        watchlist_for uuid, created_at timestamptz NOT NULL,
        invite_code text NOT NULL, admin_invite_code text NOT NULL
      );
      INSERT INTO neon_auth."user" VALUES
        ('11111111-1111-1111-1111-111111111111', 'Alice', 'private@example.com', '2026-01-01'),
        ('22222222-2222-2222-2222-222222222222', 'Alice', 'other@example.com', '2026-01-02'),
        ('33333333-3333-3333-3333-333333333333', 'Alice-2', 'third@example.com', '2026-01-03');
      INSERT INTO theatres VALUES
        ('44444444-4444-4444-4444-444444444444', 'Watchlist', '11111111-1111-1111-1111-111111111111', NULL, '2026-01-01', 'member-a', 'admin-a'),
        ('55555555-5555-5555-5555-555555555555', 'Watchlist', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', '2026-01-02', 'member-b', 'admin-b'),
        ('66666666-6666-6666-6666-666666666666', 'Watchlist-2', '11111111-1111-1111-1111-111111111111', NULL, '2026-01-03', 'member-c', 'admin-c');
    `);
    const users = (
      await client.query('SELECT * FROM neon_auth."user" ORDER BY id')
    ).rows;
    const lists = (await client.query("SELECT * FROM theatres ORDER BY id"))
      .rows;
    await client.exec(
      await readFile("drizzle/0028_rare_lady_bullseye.sql", "utf8"),
    );
    const migratedUsers = (
      await client.query<{ username: string; displayUsername: string }>(
        'SELECT * FROM neon_auth."user" ORDER BY id',
      )
    ).rows;
    expect(migratedUsers.map(({ username }) => username)).toEqual([
      "alice",
      "alice-2",
      "alice-2-2",
    ]);
    expect(
      migratedUsers.map(({ username, displayUsername, ...user }) => user),
    ).toEqual(users);
    const migratedLists = (
      await client.query<{ slug: string }>("SELECT * FROM theatres ORDER BY id")
    ).rows;
    expect(migratedLists.map(({ slug }) => slug)).toEqual([
      "watchlist-2",
      "watchlist",
      "watchlist-2-2",
    ]);
    expect(migratedLists.map(({ slug, ...list }) => list)).toEqual(lists);
  } finally {
    await client.close();
  }
});
