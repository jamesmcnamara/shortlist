import { eq } from "drizzle-orm";
import {
  findInviteCode,
  findAdminInviteCode,
  withRoomAdmin,
  withRoomMember,
  type RoomContext,
} from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { roomMembers, rooms } from "@/src/db/schema";
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
    adminInviteCode:
      role === "admin" ? await findAdminInviteCode(room.id) : undefined,
    membership: { userId, role },
    members,
  });
});

export const PATCH = withRoomAdmin({ error: "Unable to update the room." })(
  async (request: Request, { room }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }

    const [updated] = await getDb()
      .update(rooms)
      .set({ name })
      .where(eq(rooms.id, room.id))
      .returning();

    const {
      inviteCode: _withheldMember,
      adminInviteCode: _withheldAdmin,
      ...safe
    } = updated;
    return Response.json(safe);
  },
);

export const DELETE = withRoomAdmin({ error: "Unable to delete the room." })(
  async (_request: Request, { room }: RoomContext) => {
    await getDb().delete(rooms).where(eq(rooms.id, room.id));
    return new Response(null, { status: 204 });
  },
);
