import { eq } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { roomMembers, rooms } from "@/src/db/schema";

export const runtime = "nodejs";

/** Anyone holding a valid invite code may join. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const { code } = await context.params;
    const db = getDb();

    const [room] = await db
      .select({ id: rooms.id, slug: rooms.slug, name: rooms.name })
      .from(rooms)
      .where(eq(rooms.inviteCode, code))
      .limit(1);

    if (!room) {
      return Response.json(
        { error: "That invite link is no longer valid." },
        { status: 404 },
      );
    }

    // Re-joining is a no-op rather than an error, so a shared link keeps
    // working for people who already accepted it.
    await db
      .insert(roomMembers)
      .values({ roomId: room.id, userId, role: "member" })
      .onConflictDoNothing({
        target: [roomMembers.roomId, roomMembers.userId],
      });

    return Response.json({ slug: room.slug, name: room.name });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to join that room." },
      { status: 500 },
    );
  }
}
