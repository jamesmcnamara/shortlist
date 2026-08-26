import { eq, or } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { roomMembers, rooms } from "@/src/db/schema";

export const runtime = "nodejs";

/**
 * Anyone holding a valid invite code may join. The member link grants
 * "member"; the admin link grants "admin" — including upgrading someone who
 * is already a member, since sharing the admin link is an explicit decision
 * to hand out that role.
 */
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
      .select({
        id: rooms.id,
        slug: rooms.slug,
        name: rooms.name,
        inviteCode: rooms.inviteCode,
        adminInviteCode: rooms.adminInviteCode,
      })
      .from(rooms)
      .where(or(eq(rooms.inviteCode, code), eq(rooms.adminInviteCode, code)))
      .limit(1);

    if (!room) {
      return Response.json(
        { error: "That invite link is no longer valid." },
        { status: 404 },
      );
    }

    const role = room.adminInviteCode === code ? "admin" : "member";

    // Re-joining is a no-op rather than an error, so a shared link keeps
    // working for people who already accepted it. The admin link can upgrade
    // an existing member, but the member link must never downgrade an admin.
    if (role === "admin") {
      await db
        .insert(roomMembers)
        .values({ roomId: room.id, userId, role })
        .onConflictDoUpdate({
          target: [roomMembers.roomId, roomMembers.userId],
          set: { role },
        });
    } else {
      await db
        .insert(roomMembers)
        .values({ roomId: room.id, userId, role })
        .onConflictDoNothing({
          target: [roomMembers.roomId, roomMembers.userId],
        });
    }

    return Response.json({ slug: room.slug, name: room.name });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to join that room." },
      { status: 500 },
    );
  }
}
