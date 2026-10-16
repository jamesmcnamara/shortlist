import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTheatreMember, type TheatreContext } from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  nominations,
  theatreMembers,
  seen,
  type Person,
} from "@/src/db/schema";
import { badRequest, dbId, dbIdParam, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Seen is recorded per user, but it is only ever reported to a theatre alongside
 * that theatre's membership, so this returns the people in the acting theatre who
 * have seen the movie rather than everyone who has.
 */
async function seenByInTheatre(
  theatreId: string,
  movieId: number,
): Promise<Person[]> {
  return getDb()
    .select({
      id: authUsers.id,
      name: authUsers.name,
    })
    .from(seen)
    .innerJoin(authUsers, eq(authUsers.id, seen.userId))
    .innerJoin(
      theatreMembers,
      and(eq(theatreMembers.userId, seen.userId), eq(theatreMembers.theatreId, theatreId)),
    )
    .where(eq(seen.movieId, movieId));
}

/**
 * The movie has to be on this theatre's list; otherwise the route would let a
 * member confirm which movies exist outside it.
 */
const isNominatedInTheatre = async (theatreId: string, movieId: number) => {
  const [row] = await getDb()
    .select({ id: nominations.id })
    .from(nominations)
    .where(
      and(eq(nominations.theatreId, theatreId), eq(nominations.movieId, movieId)),
    )
    .limit(1);
  return Boolean(row);
};

const MOVIE_ID = "A movie id is required.";

const markBody = z.object({ movieId: dbId(MOVIE_ID) });

/** Marking a movie seen is personal, and follows the user between theatres. */
export const POST = withTheatreMember({ error: "Unable to mark that watched." })(
  async (request: Request, { theatre, userId }: TheatreContext) => {
    const parsed = await parseJson(request, markBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { movieId } = parsed.data;

    if (!(await isNominatedInTheatre(theatre.id, movieId))) {
      return Response.json(
        { error: "That movie is not on this theatre's list." },
        { status: 404 },
      );
    }

    await getDb()
      .insert(seen)
      .values({ movieId, userId })
      .onConflictDoNothing({ target: [seen.userId, seen.movieId] });

    return Response.json(
      { movieId, seenBy: await seenByInTheatre(theatre.id, movieId) },
      { status: 201 },
    );
  },
);

export const DELETE = withTheatreMember({ error: "Unable to update that movie." })(
  async (request: Request, { theatre, userId }: TheatreContext) => {
    const parsed = dbIdParam(MOVIE_ID).safeParse(
      new URL(request.url).searchParams.get("movieId"),
    );
    if (!parsed.success) return badRequest(parsed.error);
    const movieId = parsed.data;

    await getDb()
      .delete(seen)
      .where(and(eq(seen.userId, userId), eq(seen.movieId, movieId)));

    return Response.json({
      movieId,
      seenBy: await seenByInTheatre(theatre.id, movieId),
    });
  },
);
