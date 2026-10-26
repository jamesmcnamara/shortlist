import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { authUsers } from "./neon-auth-schema";
import { movies, nominations, theatreMembers, theatres } from "./schema";
import { createTestDb } from "./test-db";

describe("removing the share code", () => {
  it("drops only the share capability and preserves invites, members, and content", async () => {
    const { db, client } = await createTestDb();
    try {
      const userId = "11111111-1111-1111-1111-111111111111";
      await db.insert(authUsers).values({
        id: userId,
        name: "Alice",
        email: "alice@example.com",
      });
      const [theatre] = await db
        .insert(theatres)
        .values({
          name: "Club",
          createdBy: userId,
          inviteCode: "member-link",
          adminInviteCode: "admin-link",
        })
        .returning();
      const [member] = await db
        .insert(theatreMembers)
        .values({
          theatreId: theatre.id,
          userId,
          role: "admin",
        })
        .returning();
      const [movie] = await db
        .insert(movies)
        .values({
          tmdbId: 1,
          details: { title: "Shared movie" },
          ratings: { services: [], raw: {} },
        })
        .returning();
      const [nomination] = await db
        .insert(nominations)
        .values({
          theatreId: theatre.id,
          userId,
          movieId: movie.id,
          comment: "Keep this",
        })
        .returning();

      // Recreate the previous schema so the drop is tested with existing data.
      await client.exec(
        await readFile("drizzle/0023_theatre_share_code.sql", "utf8"),
      );
      const before = await client.query<{ share_code: string }>(
        "SELECT share_code FROM theatres",
      );
      expect(before.rows[0].share_code).toMatch(/^[0-9a-f]{32}$/);
      await client.exec(
        await readFile("drizzle/0024_sticky_stardust.sql", "utf8"),
      );

      const columns = await client.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'theatres' AND column_name = 'share_code'",
      );
      expect(columns.rows).toEqual([]);
      expect((await db.select().from(theatres)).map(withoutUpdatedAt)).toEqual([
        withoutUpdatedAt(theatre),
      ]);
      expect(await db.select().from(theatreMembers)).toEqual([member]);
      expect(await db.select().from(movies)).toEqual([movie]);
      expect(await db.select().from(nominations)).toEqual([nomination]);
    } finally {
      await client.close();
    }
  });
});

//  updatedAt naturally updates independently, so we ignore it in comparisons.
const withoutUpdatedAt = <T extends { updatedAt: unknown }>({
  updatedAt,
  ...rest
}: T) => rest;
