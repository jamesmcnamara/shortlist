import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireUserId, unauthorized, withUser } from "@/lib/auth/require-user";
import { generateInviteCode } from "@/app/lib/theatres";
import { theatrePath } from "@/lib/theatre-path";
import { getDb } from "@/src/db/client";
import { nominations, theatreMembers, theatres } from "@/src/db/schema";
import {
  listPublicTheatres,
  listPublicTheatresWithPosterPreviews,
  recentActivityOrder,
} from "@/app/lib/load-theatre";
import {
  badRequest,
  dbId,
  parseJson,
  requiredText,
} from "@/lib/validation";

export const runtime = "nodejs";

const MAX_MOVIE_IDS = 100;
const movieIdsParam = z
  .string()
  .transform((value) => value.split(",").map(Number))
  .pipe(
    z
      .array(dbId("Invalid movie id."))
      .min(1, "Invalid movie id.")
      .max(MAX_MOVIE_IDS, `Ask for at most ${MAX_MOVIE_IDS} movies.`),
  )
  .transform((ids) => [...new Set(ids)]);

const createBody = z.object({
  name: requiredText("A theatre name is required."),
});

/**
 * Theatres the caller belongs to. With `?movieIds=1,2`, each also lists which
 * of those movies it already carries, for the list pickers.
 */
export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const params = new URL(request.url).searchParams;
    if (params.has("movieIds")) {
      if (!userId) return unauthorized();
      const movieIds = movieIdsParam.safeParse(params.get("movieIds"));
      if (!movieIds.success) return badRequest(movieIds.error);
      return Response.json(await listTheatresWithMovies(userId, movieIds.data));
    }
    if (!userId) return Response.json([]);
    if (params.get("previews") === "true") {
      return Response.json(await listPublicTheatresWithPosterPreviews(userId));
    }
    return Response.json(await listPublicTheatres(userId));
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to load the theatres." },
      { status: 500 },
    );
  }
}

const listTheatresWithMovies = (userId: string, movieIds: number[]) =>
  getDb()
    .select({
      id: theatres.id,
      name: theatres.name,
      watchlistFor: theatres.watchlistFor,
      role: theatreMembers.role,
      movieIds: sql<number[]>`coalesce((
        select array_agg(${nominations.movieId} order by ${nominations.movieId})
        from ${nominations}
        where ${nominations.theatreId} = ${theatres.id}
          and ${inArray(nominations.movieId, movieIds)}
      ), '{}')`,
    })
    .from(theatreMembers)
    .innerJoin(theatres, eq(theatres.id, theatreMembers.theatreId))
    .where(
      and(
        eq(theatreMembers.userId, userId),
        eq(theatreMembers.role, "admin"),
      ),
    )
    .orderBy(...recentActivityOrder);

export const POST = withUser({
  error: "Unable to create the theatre.",
})(async (request: Request, userId: string) => {
  const parsed = await parseJson(request, createBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { name } = parsed.data;

  const db = getDb();
  const [theatre] = await db
    .insert(theatres)
    .values({
      name,
      createdBy: userId,
      inviteCode: generateInviteCode(),
      adminInviteCode: generateInviteCode(),
    })
    .returning();

  await db
    .insert(theatreMembers)
    .values({ theatreId: theatre.id, userId, role: "admin" });

  // The creator is an admin and can read the code from the settings page; it
  // is withheld here so no response carries it incidentally.
  const {
    inviteCode: _withheldMember,
    adminInviteCode: _withheldAdmin,
    ...safe
  } = theatre;
  return Response.json({ ...safe, path: theatrePath(theatre) }, { status: 201 });
});
