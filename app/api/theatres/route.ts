import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/lib/auth/require-user";
import { generateInviteCode } from "@/app/lib/theatres";
import { theatrePath } from "@/lib/theatre-path";
import { getDb } from "@/src/db/client";
import { nominations, theatreMembers, theatres } from "@/src/db/schema";
import {
  listTheatresWithPosterPreviewsForUser,
  recentActivityOrder,
} from "@/app/lib/load-theatre";
import {
  badRequest,
  dbIdParam,
  parseJson,
  requiredText,
} from "@/lib/validation";

export const runtime = "nodejs";

const createBody = z.object({
  name: requiredText("A theatre name is required."),
});

/**
 * Theatres the caller belongs to, for the switcher, the landing redirect, and
 * (with `?movieId=`) the "add to a list" picker, which needs to know which of
 * those theatres already carry the movie.
 */
export const GET = withUser({ error: "Unable to load your theatres." })(async (
  request: Request,
  userId: string,
) => {
  const params = new URL(request.url).searchParams;
  if (params.get("previews") === "true") {
    return Response.json(await listTheatresWithPosterPreviewsForUser(userId));
  }
  const movieId = dbIdParam("Invalid movie id.").safeParse(
    params.get("movieId"),
  ).data;

  const memberships = await getDb()
    .select({
      id: theatres.id,
      name: theatres.name,
      watchlistFor: theatres.watchlistFor,
      role: theatreMembers.role,
      joinedAt: theatreMembers.joinedAt,
      hasMovie: sql<boolean>`${nominations.id} is not null`,
    })
    .from(theatreMembers)
    .innerJoin(theatres, eq(theatres.id, theatreMembers.theatreId))
    .leftJoin(
      nominations,
      and(
        eq(nominations.theatreId, theatres.id),
        eq(nominations.movieId, movieId ?? -1),
      ),
    )
    .where(eq(theatreMembers.userId, userId))
    .orderBy(...recentActivityOrder);

  if (!movieId) {
    return Response.json(memberships.map(({ hasMovie, ...theatre }) => theatre));
  }

  return Response.json(memberships);
});

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
