import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { authUsers } from "@/src/db/neon-auth-schema";
import { createTestDb } from "./test-db";
import { notifications, theatreMembers, theatres } from "./schema";

function reverseRename(statement: string): string {
  const table = statement.match(
    /^ALTER TABLE "([^"]+)" RENAME TO "([^"]+)";$/,
  );
  if (table) return `ALTER TABLE "${table[2]}" RENAME TO "${table[1]}";`;

  const column = statement.match(
    /^ALTER TABLE "([^"]+)" RENAME COLUMN "([^"]+)" TO "([^"]+)";$/,
  );
  if (column) {
    return `ALTER TABLE "${column[1]}" RENAME COLUMN "${column[3]}" TO "${column[2]}";`;
  }

  const constraint = statement.match(
    /^ALTER TABLE "([^"]+)" RENAME CONSTRAINT "([^"]+)" TO "([^"]+)";$/,
  );
  if (constraint) {
    return `ALTER TABLE "${constraint[1]}" RENAME CONSTRAINT "${constraint[3]}" TO "${constraint[2]}";`;
  }

  const index = statement.match(
    /^ALTER INDEX "([^"]+)" RENAME TO "([^"]+)";$/,
  );
  if (index) return `ALTER INDEX "${index[2]}" RENAME TO "${index[1]}";`;

  throw new Error(`Unsupported migration statement: ${statement}`);
}

describe("theatre rename migration", () => {
  it("renames storage without losing theatre memberships or notifications", async () => {
    const fixture = await createTestDb();
    try {
      const userId = "11111111-1111-1111-1111-111111111111";
      await fixture.db.insert(authUsers).values({
        id: userId,
        name: "Alice",
        email: "alice@example.com",
      });
      const [theatre] = await fixture.db
        .insert(theatres)
        .values({
          name: "Friday movies",
          createdBy: userId,
          inviteCode: "member-link",
          adminInviteCode: "admin-link",
        })
        .returning();
      await fixture.db.insert(theatreMembers).values({
        theatreId: theatre.id,
        userId,
        role: "admin",
      });
      await fixture.db.insert(notifications).values({
        theatreId: theatre.id,
        userId,
      });

      const migration = await readFile(
        "drizzle/0022_rename_rooms_to_theatres.sql",
        "utf8",
      );
      const statements = migration
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      await fixture.client.exec(
        [...statements].reverse().map(reverseRename).join("\n"),
      );
      await fixture.client.exec(migration);

      expect(await fixture.db.select().from(theatres)).toEqual([theatre]);
      expect(await fixture.db.select().from(theatreMembers)).toEqual([
        expect.objectContaining({
          theatreId: theatre.id,
          userId,
          role: "admin",
        }),
      ]);
      expect(await fixture.db.select().from(notifications)).toEqual([
        { theatreId: theatre.id, userId },
      ]);
    } finally {
      await fixture.client.close();
    }
  });
});
