import { and, eq } from "drizzle-orm";
import { getNomination, listNominations } from "@/app/lib/queries";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";

export const runtime = "nodejs";

export const GET = withRoomMember({ error: "Unable to load nominations" })(
  async (_request: Request, { room }: RoomContext) =>
    Response.json(await listNominations(room.id)),
);

export const POST = withRoomMember({ error: "Unable to create nomination." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const movieId = Number(body?.movieId);
    if (!Number.isInteger(movieId)) {
      return Response.json(
        { error: "A movie id is required." },
        { status: 400 },
      );
    }
    const comment =
      typeof body?.comment === "string" && body.comment.trim()
        ? body.comment.trim()
        : null;

    const db = getDb();

    const [movie] = await db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.id, movieId))
      .limit(1);
    if (!movie) {
      return Response.json(
        { error: "That movie is no longer available." },
        { status: 400 },
      );
    }

    const [inserted] = await db
      .insert(nominations)
      .values({ roomId: room.id, userId, movieId, comment })
      .returning({ id: nominations.id });

    return Response.json(await getNomination(room.id, inserted.id), {
      status: 201,
    });
  },
);

export const PATCH = withRoomMember({
  error: "Unable to update the nomination.",
})(async (request: Request, { room, userId, role }: RoomContext) => {
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  const comment: string | null =
    typeof body?.comment === "string" ? body.comment.trim() : null;
  const completed: boolean | null =
    typeof body?.completed === "boolean" ? body.completed : null;

  if (!Number.isInteger(id)) {
    return Response.json(
      { error: "A nomination id is required." },
      { status: 400 },
    );
  }

  if (comment === null && completed === null) {
    return Response.json({ error: "A comment is required." }, { status: 400 });
  }

  // Marking a nomination completed moves it into the room's Watched section
  // for everyone, so only an admin may flip that flag. A comment edit is
  // still scoped to the nominator, as before.
  if (completed !== null && role !== "admin") {
    return Response.json(
      { error: "Only an admin can mark a movie completed." },
      { status: 403 },
    );
  }

  const values: Partial<typeof nominations.$inferInsert> = {};
  if (comment !== null) values.comment = comment || null;
  if (completed !== null) values.completed = completed;

  const ownershipCondition =
    completed !== null ? undefined : eq(nominations.userId, userId);

  const updated = await getDb()
    .update(nominations)
    .set(values)
    .where(
      and(
        eq(nominations.id, id),
        eq(nominations.roomId, room.id),
        ownershipCondition,
      ),
    )
    .returning({ id: nominations.id });

  if (updated.length === 0) {
    return Response.json(
      { error: "That nomination no longer exists." },
      { status: 404 },
    );
  }

  return Response.json(await getNomination(room.id, id), { status: 200 });
});

export const DELETE = withRoomMember({
  error: "Unable to delete the nomination.",
})(async (request: Request, { room, userId, role }: RoomContext) => {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json(
      { error: "A nomination id is required." },
      { status: 400 },
    );
  }

  // Admins can remove any nomination; everyone else can only rescind their own.
  const ownershipCondition =
    role === "admin" ? undefined : eq(nominations.userId, userId);

  const deleted = await getDb()
    .delete(nominations)
    .where(
      and(
        eq(nominations.id, id),
        eq(nominations.roomId, room.id),
        ownershipCondition,
      ),
    )
    .returning({ id: nominations.id });
  if (deleted.length === 0)
    return Response.json(
      { error: "That nomination no longer exists." },
      { status: 404 },
    );
  return new Response(null, { status: 204 });
});
