import { eq } from "drizzle-orm";
import { cycleFor } from "@/app/lib/cycles";
import { parseConfigUpdate } from "@/app/lib/rooms";
import {
  findInviteCode,
  withRoomAdmin,
  withRoomMember,
  type RoomContext,
} from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { roomMembers, rooms, nominations } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";

export const runtime = "nodejs";

export const GET = withRoomMember({ error: "Unable to load the room." })(async (
  _request: Request,
  { room, role, userId }: RoomContext,
) => {
  const members = await getDb()
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: roomMembers.role,
      joinedAt: roomMembers.joinedAt,
    })
    .from(roomMembers)
    .innerJoin(authUsers, eq(authUsers.id, roomMembers.userId))
    .where(eq(roomMembers.roomId, room.id));

  return Response.json({
    room,
    // The invite code is a capability, so it is fetched only once the caller
    // is known to be an admin rather than filtered out of a wider payload.
    inviteCode: role === "admin" ? await findInviteCode(room.id) : undefined,
    membership: { userId, role },
    currentCycle: cycleFor(room),
    members,
  });
});

export const PATCH = withRoomAdmin({ error: "Unable to update the room." })(
  async (request: Request, { room }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const parsed = parseConfigUpdate(body);
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }

    const values: Record<string, unknown> = { ...parsed.values };
    if (typeof body?.name === "string" && body.name.trim()) {
      values.name = body.name.trim();
    }

    if (Object.keys(values).length === 0) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Changing the cycle length re-bases every cycle number, so existing
    // nominations and votes would land in a different bucket than the one they
    // were cast in. Left as an explicit constraint rather than silently
    // corrupting history.
    if (values.cycleLength && values.cycleLength !== room.cycleLength) {
      const [existing] = await getDb()
        .select({ id: nominations.id })
        .from(nominations)
        .where(eq(nominations.roomId, room.id))
        .limit(1);
      if (existing) {
        return Response.json(
          {
            error:
              "The cycle length cannot be changed once a room has nominations.",
          },
          { status: 409 },
        );
      }
    }

    const [updated] = await getDb()
      .update(rooms)
      .set(values)
      .where(eq(rooms.id, room.id))
      .returning();

    const { inviteCode: _withheld, ...safe } = updated;
    return Response.json(safe);
  },
);

export const DELETE = withRoomAdmin({ error: "Unable to delete the room." })(
  async (_request: Request, { room }: RoomContext) => {
    await getDb().delete(rooms).where(eq(rooms.id, room.id));
    return new Response(null, { status: 204 });
  },
);
