import { eq } from "drizzle-orm";
import { generateInviteCode } from "@/app/lib/rooms";
import { withRoomAdmin, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { rooms } from "@/src/db/schema";

export const runtime = "nodejs";

/**
 * Invalidates the old link, which is the only way to un-invite a stranger.
 * `kind` selects which link to rotate; the member link is the default so
 * existing callers keep working unchanged.
 */
export const POST = withRoomAdmin({
  error: "Unable to rotate the invite link.",
})(async (request: Request, { room }: RoomContext) => {
  const body = await request.json().catch(() => null);
  const kind = body?.kind === "admin" ? "admin" : "member";

  if (kind === "admin") {
    const [updated] = await getDb()
      .update(rooms)
      .set({ adminInviteCode: generateInviteCode() })
      .where(eq(rooms.id, room.id))
      .returning({ adminInviteCode: rooms.adminInviteCode });
    return Response.json(updated);
  }

  const [updated] = await getDb()
    .update(rooms)
    .set({ inviteCode: generateInviteCode() })
    .where(eq(rooms.id, room.id))
    .returning({ inviteCode: rooms.inviteCode });

  return Response.json(updated);
});
