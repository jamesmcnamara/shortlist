import { and, eq, sql } from "drizzle-orm";
import { cycleFor } from "@/app/lib/cycles";
import { getNomination, listNominations } from "@/app/lib/queries";
import { getMovieProvider } from "@/app/lib/movie-metadata";
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
      const existing = await db
        .select({ id: nominations.id })
        .from(nominations)
        .where(
          and(
            eq(nominations.roomId, room.id),
            eq(nominations.userId, userId),
            eq(nominations.cycle, cycle),
          ),
        );

      if (existing.length >= room.nominationsPerCycle) {
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

    // The cap was checked above for a fast, specific error, but that check and
    // this insert are separate round trips with a TMDB fetch between them.
    // Re-asserting both conditions inside the INSERT narrows that window to a
    // single statement, which is what makes a double-click safe. See the note
    // in the votes route: this bounds the race rather than eliminating it.
    const capCondition =
      room.nominationsPerCycle === null
        ? sql`true`
        : sql`(
            select count(*)
            from ${nominations}
            where ${nominations.roomId} = ${room.id}
              and ${nominations.userId} = ${userId}
              and ${nominations.cycle} = ${cycle}
          ) < ${room.nominationsPerCycle}`;

    const duplicateCondition = room.allowDuplicateNominations
      ? sql`true`
      : sql`not exists (
          select 1
          from ${nominations}
          where ${nominations.roomId} = ${room.id}
            and ${nominations.movieId} = ${movie.id}
        )`;

    const inserted = await db.execute(sql`
      insert into ${nominations} (room_id, user_id, movie_id, comment, cycle)
      select ${room.id}, ${userId}, ${movie.id}, ${comment}, ${cycle}
      where ${capCondition} and ${duplicateCondition}
      returning id
    `);

    const rows = (inserted as unknown as { rows: { id: number }[] }).rows ?? [];
    if (rows.length === 0) {
      // One of the two guards rejected it. Work out which so the message is
      // specific; this only runs on the failure path.
      const duplicate = room.allowDuplicateNominations
        ? []
        : await db
            .select({ id: nominations.id })
            .from(nominations)
            .where(
              and(
                eq(nominations.roomId, room.id),
                eq(nominations.movieId, movie.id),
              ),
            )
            .limit(1);

      return Response.json(
        {
          error:
            duplicate.length > 0
              ? "That movie has already been nominated."
              : nominationLimitMessage(room.nominationsPerCycle ?? 0),
        },
        { status: 409 },
      );
    }

    return Response.json(await getNomination(room.id, rows[0].id), {
      status: 201,
    });
  },
);

export const DELETE = withRoomMember({
  error: "Unable to delete the nomination.",
})(async (request: Request, { room, userId }: RoomContext) => {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json(
      { error: "A nomination id is required." },
      { status: 400 },
    );
  }

  const deleted = await getDb()
    .delete(nominations)
    .where(
      and(
        eq(nominations.id, id),
        eq(nominations.roomId, room.id),
        eq(nominations.userId, userId),
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
