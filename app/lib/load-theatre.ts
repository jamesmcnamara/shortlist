import type { TheatreSummary, TheatreSummaryWithPosterPreviews } from "@/app/lib/api";
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
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";

export interface LoadedTheatre {
  /** Never the raw row: the invite code must not reach the client. */
  theatre: SafeTheatre;
  role: TheatreRole;
  theatres: TheatreSummary[];
  userId: string;
}

/** Latest nomination first; theatres with none fall back to newest membership. */
export const recentActivityOrder = [
  sql`(select max(${nominations.createdAt}) from ${nominations} where ${nominations.theatreId} = ${theatres.id}) desc nulls last`,
  desc(theatreMembers.joinedAt),
];

/** Theatres the user belongs to, most recently added-to first. */
export async function listTheatresForUser(userId: string): Promise<TheatreSummary[]> {
  const memberships = await getDb()
    .select({
      id: theatres.id,
      name: theatres.name,
      watchlistFor: theatres.watchlistFor,
      role: theatreMembers.role,
    })
    .from(theatreMembers)
    .innerJoin(theatres, eq(theatres.id, theatreMembers.theatreId))
    .where(eq(theatreMembers.userId, userId))
    .orderBy(...recentActivityOrder);

  return memberships as TheatreSummary[];
}

/** Enough to fill the widest theatre card; the UI clips whatever doesn't fit. */
export const MAX_POSTER_PREVIEWS = 12;

/** Theatres the user belongs to, with their most recent nomination posters. */
export async function listTheatresWithPosterPreviewsForUser(
  userId: string,
): Promise<TheatreSummaryWithPosterPreviews[]> {
  const memberships = await listTheatresForUser(userId);
  if (memberships.length === 0) return [];

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
        inArray(
          nominations.theatreId,
          memberships.map(({ id }) => id),
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

  return memberships.map((theatre) => ({
    ...theatre,
    posterUrls: posters
      .filter(({ theatreId }) => theatreId === theatre.id)
      .map(({ posterUrl }) => posterUrl),
  }));
}

export type LoadTheatreResult =
  | { status: "ok"; data: LoadedTheatre }
  | { status: "unauthenticated" }
  | { status: "not-a-member" };

/**
 * The server-side gate for the read path. A page renders only after this has
 * confirmed the viewer belongs to the theatre.
 */
export async function loadTheatre(
  theatreId: string,
): Promise<LoadTheatreResult> {
  const userId = await requireUserId();
  if (!userId) return { status: "unauthenticated" };

  const theatre = await findTheatreById(theatreId);
  if (!theatre) return { status: "not-a-member" };

  const role = await findMembership(theatre.id, userId);
  if (!role) return { status: "not-a-member" };

  return {
    status: "ok",
    data: {
      theatre,
      role,
      theatres: await listTheatresForUser(userId),
      userId,
    },
  };
}
