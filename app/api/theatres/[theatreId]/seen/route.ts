import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTheatreUser, type TheatreUserContext } from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { nominations, seen } from "@/src/db/schema";
import { seenByMovieIds } from "@/app/lib/queries";
import { badRequest, dbId, dbIdParam, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

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
export const POST = withTheatreUser({ error: "Unable to mark that watched." })(
  async (request: Request, { theatre, userId }: TheatreUserContext) => {
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
      { movieId, seenBy: (await seenByMovieIds([movieId])).get(movieId) ?? [] },
      { status: 201 },
    );
  },
);

export const DELETE = withTheatreUser({ error: "Unable to update that movie." })(
  async (request: Request, { theatre, userId }: TheatreUserContext) => {
    const parsed = dbIdParam(MOVIE_ID).safeParse(
      new URL(request.url).searchParams.get("movieId"),
    );
    if (!parsed.success) return badRequest(parsed.error);
    const movieId = parsed.data;

    if (!(await isNominatedInTheatre(theatre.id, movieId))) {
      return Response.json(
        { error: "That movie is not on this theatre's list." },
        { status: 404 },
      );
    }

    await getDb()
      .delete(seen)
      .where(and(eq(seen.userId, userId), eq(seen.movieId, movieId)));

    return Response.json({
      movieId,
      seenBy: (await seenByMovieIds([movieId])).get(movieId) ?? [],
    });
  },
);
