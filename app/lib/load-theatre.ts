import type {
  TheatreSummary,
  TheatreSummaryWithPosterPreviews,
} from "@/app/lib/api";
import {
  findMembership,
  findTheatreById,
  type SafeTheatre,
} from "@/lib/auth/require-theatre";
import { requireUserId } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import {
  movies,
  nominations,
  theatreMembers,
  theatres,
  type TheatreRole,
} from "@/src/db/schema";
import { and, desc, eq, inArray, lte, not, sql } from "drizzle-orm";

export interface LoadedTheatre {
  /** Never the raw row: the invite code must not reach the client. */
  theatre: SafeTheatre;
  role: TheatreRole | null;
  theatres: TheatreSummary[];
  userId: string | null;
}

export const recentActivityOrder = [
  sql`(select max(${nominations.createdAt}) from ${nominations} where ${nominations.theatreId} = ${theatres.id}) desc nulls last`,
  desc(theatres.createdAt),
];

/** A user's theatres, with the current viewer's membership role. */
export async function listPublicTheatres(
  memberUserId: string,
  viewerUserId: string | null = memberUserId,
): Promise<TheatreSummary[]> {
  const viewerMembership = viewerUserId
    ? and(
        eq(theatreMembers.theatreId, theatres.id),
        eq(theatreMembers.userId, viewerUserId),
      )
    : sql`false`;
  const rows = await getDb()
    .select({
      id: theatres.id,
      name: theatres.name,
      watchlistFor: theatres.watchlistFor,
      role: theatreMembers.role,
    })
    .from(theatres)
    .leftJoin(theatreMembers, viewerMembership)
    .where(
      inArray(
        theatres.id,
        getDb()
          .select({ id: theatreMembers.theatreId })
          .from(theatreMembers)
          .where(eq(theatreMembers.userId, memberUserId)),
      ),
    )
    .orderBy(...recentActivityOrder);

  return rows as TheatreSummary[];
}

/** Enough to fill the widest theatre card; the UI clips whatever doesn't fit. */
export const MAX_POSTER_PREVIEWS = 12;

/** A user's theatres with their most recent nomination posters. */
export async function listPublicTheatresWithPosterPreviews(
  memberUserId: string,
  viewerUserId: string | null = memberUserId,
): Promise<TheatreSummaryWithPosterPreviews[]> {
  const theatres = await listPublicTheatres(memberUserId, viewerUserId);
  if (theatres.length === 0) return [];

  const posterUrl = sql<string>`${movies.details} ->> 'posterUrl'`;
  const rankedPosters = getDb()
    .select({
      theatreId: nominations.theatreId,
      posterUrl: posterUrl.as("poster_url"),
      rank: sql<number>`row_number() over (partition by ${nominations.theatreId} order by ${nominations.createdAt} desc, ${nominations.id} desc)`.as(
        "poster_rank",
      ),
    })
    .from(nominations)
    .innerJoin(movies, eq(movies.id, nominations.movieId))
    .where(
      and(
        not(nominations.completed),
        inArray(
          nominations.theatreId,
          theatres.map(({ id }) => id),
        ),
        sql`${posterUrl} is not null`,
      ),
    )
    .as("ranked_posters");

  const posters = await getDb()
    .select({
      theatreId: rankedPosters.theatreId,
      posterUrl: rankedPosters.posterUrl,
    })
    .from(rankedPosters)
    .where(lte(rankedPosters.rank, MAX_POSTER_PREVIEWS))
    .orderBy(rankedPosters.theatreId, rankedPosters.rank);

  return theatres.map((theatre) => ({
    ...theatre,
    posterUrls: posters
      .filter(({ theatreId }) => theatreId === theatre.id)
      .map(({ posterUrl }) => posterUrl),
  }));
}

export type LoadTheatreResult =
  | { status: "ok"; data: LoadedTheatre }
  | { status: "not-found" };

/**
 * Server-side data for a public theatre page. Membership is optional and only
 * affects the viewer's available controls.
 */
export async function loadTheatre(
  theatreId: string,
): Promise<LoadTheatreResult> {
  const userId = await requireUserId();
  const theatre = await findTheatreById(theatreId);
  if (!theatre) return { status: "not-found" };

  const role = userId ? await findMembership(theatre.id, userId) : null;

  return {
    status: "ok",
    data: {
      theatre,
      role,
      theatres: userId ? await listPublicTheatres(userId) : [],
      userId,
    },
  };
}
