import { sql } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { rooms, roomMembers } from "@/src/db/schema";
import { generateInviteCode } from "@/app/lib/rooms";

export async function createWatchlist(userId: string): Promise<void> {
  const inviteCode = generateInviteCode();
  const adminInviteCode = generateInviteCode();

  // One statement keeps room creation and admin membership atomic, even over HTTP.
  await getDb().execute(sql`
    WITH watchlist AS (
      INSERT INTO ${rooms} ("name", "created_by", "watchlist_for", "invite_code", "admin_invite_code")
      VALUES ('Watchlist', ${userId}, ${userId}, ${inviteCode}, ${adminInviteCode})
      ON CONFLICT ("watchlist_for") DO UPDATE
        SET "watchlist_for" = EXCLUDED."watchlist_for"
      RETURNING "id"
    )
    INSERT INTO ${roomMembers} ("room_id", "user_id", "role")
    SELECT "id", ${userId}, 'admin' FROM watchlist
    ON CONFLICT ("room_id", "user_id") DO UPDATE SET "role" = 'admin'
  `);
}
