import { eq } from "drizzle-orm";
import { generateInviteCode } from "@/app/lib/rooms";
import { withRoomAdmin, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { rooms } from "@/src/db/schema";

export const runtime = "nodejs";

/** Invalidates the old link, which is the only way to un-invite a stranger. */
export const POST = withRoomAdmin({
  error: "Unable to rotate the invite link.",
})(async (_request: Request, { room }: RoomContext) => {
  const [updated] = await getDb()
    .update(rooms)
    .set({ inviteCode: generateInviteCode() })
    .where(eq(rooms.id, room.id))
    .returning({ inviteCode: rooms.inviteCode });

  return Response.json(updated);
});
