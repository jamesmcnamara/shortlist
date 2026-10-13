import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withRoomAdmin, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { roomMembers } from "@/src/db/schema";
import { badRequest, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

const roleBody = z.object({
  role: z.enum(["admin", "member"], "Role must be admin or member."),
});

/**
 * Removing a member deliberately leaves their movies in place —
 * otherwise a departure would silently gut the list.
 */
export const DELETE = withRoomAdmin({ error: "Unable to remove that member." })(
  async (_request: Request, { room, params, userId }: RoomContext) => {
    const targetId = params.userId;
    if (!targetId) {
      return Response.json(
        { error: "A user id is required." },
        { status: 400 },
      );
    }

    if (targetId === userId) {
      return Response.json(
        { error: "You cannot remove yourself from a room you administer." },
        { status: 409 },
      );
    }

    // The caller is necessarily an admin other than the target, so the room
    // keeps at least one admin without a further check.
    const removed = await getDb()
      .delete(roomMembers)
      .where(
        and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, targetId)),
      )
      .returning({ userId: roomMembers.userId });

    if (removed.length === 0) {
      return Response.json(
        { error: "That person is not a member of this room." },
        { status: 404 },
      );
    }

    return new Response(null, { status: 204 });
  },
);

/** Promote or demote. */
export const PATCH = withRoomAdmin({ error: "Unable to update that member." })(
  async (request: Request, { room, params, userId }: RoomContext) => {
    const targetId = params.userId;
    const parsed = await parseJson(request, roleBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { role } = parsed.data;

    if (targetId === userId && role === "member") {
      return Response.json(
        { error: "You cannot demote yourself." },
        { status: 409 },
      );
    }

    const [updated] = await getDb()
      .update(roomMembers)
      .set({ role })
      .where(
        and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, targetId)),
      )
      .returning();

    if (!updated) {
      return Response.json(
        { error: "That person is not a member of this room." },
        { status: 404 },
      );
    }

    return Response.json(updated);
  },
);
