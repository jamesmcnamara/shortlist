import { and, eq } from "drizzle-orm";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { seen } from "@/src/db/schema";

export const runtime = "nodejs";

export const GET = withRoomMember({ error: "Unable to load watched movies." })(
  async (_request: Request, { room }: RoomContext) => {
    const watched = await getDb()
      .select()
      .from(seen)
      .where(eq(seen.roomId, room.id));
    return Response.json(watched);
  },
);

/** Marking a movie watched is a room-level act, not a personal one. */
export const POST = withRoomMember({ error: "Unable to mark that watched." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const movieId = Number(body?.movieId);
    if (!Number.isInteger(movieId)) {
      return Response.json(
        { error: "A movie id is required." },
        { status: 400 },
      );
    }

    const [row] = await getDb()
      .insert(seen)
      .values({ roomId: room.id, movieId, markedBy: userId })
      .onConflictDoNothing({ target: [seen.roomId, seen.movieId] })
      .returning();

    return Response.json(row ?? { roomId: room.id, movieId }, { status: 201 });
  },
);

export const DELETE = withRoomMember({ error: "Unable to update that movie." })(
  async (request: Request, { room }: RoomContext) => {
    const movieId = Number(new URL(request.url).searchParams.get("movieId"));
    if (!Number.isInteger(movieId)) {
      return Response.json(
        { error: "A movie id is required." },
        { status: 400 },
      );
    }

    await getDb()
      .delete(seen)
      .where(and(eq(seen.roomId, room.id), eq(seen.movieId, movieId)));

    return new Response(null, { status: 204 });
  },
);
