import { getNomination, nominationExistsInRoom } from "@/app/lib/queries";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { nomcoms } from "@/src/db/schema";
import { badRequest, dbId, parseJson, requiredText } from "@/lib/validation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

export const runtime = "nodejs";

const comment = requiredText("A comment is required.");

const createBody = z.object({
  nominationId: dbId("A nomination id is required."),
  comment,
});

const updateBody = z.object({
  id: dbId("A comment id is required."),
  comment,
});

export const POST = withRoomMember({ error: "Unable to add your comment." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const parsed = await parseJson(request, createBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { nominationId, comment } = parsed.data;

    if (!(await nominationExistsInRoom(room.id, nominationId))) {
      return Response.json(
        { error: "That nomination no longer exists." },
        { status: 404 },
      );
    }

    await getDb()
      .insert(nomcoms)
      .values({ roomId: room.id, userId, nominationId, comment });

    return Response.json(await getNomination(room.id, nominationId), {
      status: 201,
    });
  },
);

export const PATCH = withRoomMember({
  error: "Unable to update your comment.",
})(async (request: Request, { room, userId }: RoomContext) => {
  const parsed = await parseJson(request, updateBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { id, comment } = parsed.data;

  const [updated] = await getDb()
    .update(nomcoms)
    .set({ comment })
    .where(
      and(
        eq(nomcoms.id, id),
        eq(nomcoms.roomId, room.id),
        eq(nomcoms.userId, userId),
      ),
    )
    .returning({ nominationId: nomcoms.nominationId });

  if (!updated) {
    return Response.json(
      { error: "That comment no longer exists." },
      { status: 404 },
    );
  }

  return Response.json(await getNomination(room.id, updated.nominationId), {
    status: 200,
  });
});
