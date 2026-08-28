import { and, eq } from "drizzle-orm";
import { cycleFor } from "@/app/lib/cycles";
import { getNomination, listNominations } from "@/app/lib/queries";
import { getMovieProvider } from "@/app/lib/movie-metadata";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb, type DB } from "@/src/db/client";
import { movies, nominations, type Room } from "@/src/db/schema";

export const runtime = "nodejs";

export const GET = withRoomMember({ error: "Unable to load nominations" })(
  async (_request: Request, { room }: RoomContext) =>
    Response.json(await listNominations(room.id)),
);

/**
 * Only nominations still awaiting a verdict count against a room's per-cycle
 * cap; once one is marked completed and moves to Watched, the nominator gets
 * their slot back.
 */
const activeNominationCount = (
  db: DB,
  roomId: string,
  userId: string,
  cycle: number,
) =>
  db.$count(
    nominations,
    and(
      eq(nominations.roomId, roomId),
      eq(nominations.userId, userId),
      eq(nominations.cycle, cycle),
      eq(nominations.completed, false),
    ),
  );

export const POST = withRoomMember({ error: "Unable to create nomination." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const tmdbId = Number(body?.tmdbId);
    if (!Number.isInteger(tmdbId)) {
      return Response.json(
        { error: "A TMDB movie id is required." },
        { status: 400 },
      );
    }
    const comment =
      typeof body?.comment === "string" && body.comment.trim()
        ? body.comment.trim()
        : null;

    const cycle = cycleFor(room);
    const db = getDb();

    // A null cap means unlimited, which is what makes a watch list a watch
    // list. There is no separate code path for it. Checked before any external
    // call, so hitting your own limit never depends on TMDB being reachable.
    if (room.nominationsPerCycle !== null) {
      const active = await activeNominationCount(db, room.id, userId, cycle);
      if (active >= room.nominationsPerCycle) {
        return Response.json(
          { error: nominationLimitMessage(room.nominationsPerCycle) },
          { status: 409 },
        );
      }
    }

    const provider = getMovieProvider();
    if (!provider.hasCredentials()) {
      return Response.json(
        { error: "TMDB credentials are not configured." },
        { status: 500 },
      );
    }

    let values;
    try {
      values = await provider.fetchMovieValues(tmdbId);
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: "Unable to load that movie right now." },
        { status: 502 },
      );
    }

    const [movie] = await db
      .insert(movies)
      .values(values)
      .onConflictDoUpdate({ target: movies.tmdbId, set: values })
      .returning();

    const [inserted] = await db
      .insert(nominations)
      .values({ roomId: room.id, userId, movieId: movie.id, comment, cycle })
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

  // Admins can remove any nomination in a watchlist-style room; everyone else
  // can only rescind their own.
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

const nominationLimitMessage = (limit: number) =>
  limit === 1
    ? "You can only nominate one movie per cycle."
    : `You have used all ${limit} of your nominations for this cycle.`;
