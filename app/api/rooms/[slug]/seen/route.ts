import { and, eq } from "drizzle-orm";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { nominations, roomMembers, seen, type User } from "@/src/db/schema";

export const runtime = "nodejs";

/**
 * Seen is recorded per user, but it is only ever reported to a room alongside
 * that room's membership, so this returns the people in the acting room who
 * have seen the movie rather than everyone who has.
 */
async function seenByInRoom(
  roomId: string,
  movieId: number,
): Promise<User[]> {
  return getDb()
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(seen)
    .innerJoin(authUsers, eq(authUsers.id, seen.userId))
    .innerJoin(
      roomMembers,
      and(eq(roomMembers.userId, seen.userId), eq(roomMembers.roomId, roomId)),
    )
    .where(eq(seen.movieId, movieId));
}

/**
 * The movie has to be on this room's list; otherwise the route would let a
 * member confirm which movies exist outside it.
 */
const isNominatedInRoom = async (roomId: string, movieId: number) => {
  const [row] = await getDb()
    .select({ id: nominations.id })
    .from(nominations)
    .where(
      and(eq(nominations.roomId, roomId), eq(nominations.movieId, movieId)),
    )
    .limit(1);
  return Boolean(row);
};

const parseMovieId = (value: unknown) => {
  const movieId = Number(value);
  return Number.isInteger(movieId) ? movieId : null;
};

const badMovieId = () =>
  Response.json({ error: "A movie id is required." }, { status: 400 });

/** Marking a movie seen is personal, and follows the user between rooms. */
export const POST = withRoomMember({ error: "Unable to mark that watched." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const movieId = parseMovieId(body?.movieId);
    if (movieId === null) return badMovieId();

    if (!(await isNominatedInRoom(room.id, movieId))) {
      return Response.json(
        { error: "That movie is not on this room's list." },
        { status: 404 },
      );
    }

    await getDb()
      .insert(seen)
      .values({ movieId, userId })
      .onConflictDoNothing({ target: [seen.userId, seen.movieId] });

    return Response.json(
      { movieId, seenBy: await seenByInRoom(room.id, movieId) },
      { status: 201 },
    );
  },
);

export const DELETE = withRoomMember({ error: "Unable to update that movie." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const movieId = parseMovieId(
      new URL(request.url).searchParams.get("movieId"),
    );
    if (movieId === null) return badMovieId();

    await getDb()
      .delete(seen)
      .where(and(eq(seen.userId, userId), eq(seen.movieId, movieId)));

    return Response.json({
      movieId,
      seenBy: await seenByInRoom(room.id, movieId),
    });
  },
);
