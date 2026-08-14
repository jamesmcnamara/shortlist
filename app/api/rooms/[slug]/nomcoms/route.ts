import { getNomination, nominationExistsInRoom } from "@/app/lib/queries";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { nomcoms } from "@/src/db/schema";

export const runtime = "nodejs";

export const POST = withRoomMember({ error: "Unable to add your comment." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const nominationId = Number(body?.nominationId);
    const comment =
      typeof body?.comment === "string" ? body.comment.trim() : "";

    if (!Number.isInteger(nominationId)) {
      return Response.json(
        { error: "A nomination id is required." },
        { status: 400 },
      );
    }

    if (!comment) {
      return Response.json(
        { error: "A comment is required." },
        { status: 400 },
      );
    }

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
