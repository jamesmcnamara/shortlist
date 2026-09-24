import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { cycleFor } from "@/app/lib/cycles";
import {
  findMembership,
  findRoomBySlug,
  type SafeRoom,
} from "@/lib/auth/require-room";
import { requireUserId } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import {
  movies,
  nominations,
  roomMembers,
  rooms,
  type RoomRole,
} from "@/src/db/schema";
import type { RoomSummary } from "@/app/lib/api";

export interface LoadedRoom {
  /** Never the raw row: the invite code must not reach the client. */
  room: SafeRoom;
  role: RoomRole;
  currentCycle: number;
  rooms: RoomSummary[];
  userId: string;
}

/** Rooms the user belongs to, newest membership first. */
export async function listRoomsForUser(userId: string): Promise<RoomSummary[]> {
  const memberships = await getDb()
    .select({
      id: rooms.id,
      slug: rooms.slug,
      name: rooms.name,
      cycleLength: rooms.cycleLength,
      nominationsPerCycle: rooms.nominationsPerCycle,
      votesPerCycle: rooms.votesPerCycle,
      role: roomMembers.role,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(eq(roomMembers.userId, userId))
    .orderBy(desc(roomMembers.joinedAt));

  return memberships as RoomSummary[];
}

export interface RoomSummaryWithPosterPreviews extends RoomSummary {
  posterUrls: string[];
}

/** Rooms the user belongs to, with up to three recent nomination posters. */
export async function listRoomsWithPosterPreviewsForUser(
  userId: string,
): Promise<RoomSummaryWithPosterPreviews[]> {
  const memberships = await listRoomsForUser(userId);
  if (memberships.length === 0) return [];

  const posterUrl = sql<string>`${movies.details} ->> 'posterUrl'`;
  const rankedPosters = getDb()
    .select({
      roomId: nominations.roomId,
      posterUrl: posterUrl.as("poster_url"),
      rank:
        sql<number>`row_number() over (partition by ${nominations.roomId} order by ${nominations.createdAt} desc, ${nominations.id} desc)`.as(
          "poster_rank",
        ),
    })
    .from(nominations)
    .innerJoin(movies, eq(movies.id, nominations.movieId))
    .where(
      and(
        inArray(nominations.roomId, memberships.map(({ id }) => id)),
        sql`${posterUrl} is not null`,
      ),
    )
    .as("ranked_posters");

  const posters = await getDb()
    .select({
      roomId: rankedPosters.roomId,
      posterUrl: rankedPosters.posterUrl,
    })
    .from(rankedPosters)
    .where(lte(rankedPosters.rank, 3))
    .orderBy(rankedPosters.roomId, rankedPosters.rank);

  return memberships.map((room) => ({
    ...room,
    posterUrls: posters
      .filter(({ roomId }) => roomId === room.id)
      .map(({ posterUrl }) => posterUrl),
  }));
}

export type LoadRoomResult =
  | { status: "ok"; data: LoadedRoom }
  | { status: "unauthenticated" }
  | { status: "not-a-member" };

/**
 * The server-side gate for the read path. A page renders only after this has
 * confirmed the viewer belongs to the room.
 */
export async function loadRoom(slug: string): Promise<LoadRoomResult> {
  const userId = await requireUserId();
  if (!userId) return { status: "unauthenticated" };

  const room = await findRoomBySlug(slug);
  if (!room) return { status: "not-a-member" };

  const role = await findMembership(room.id, userId);
  if (!role) return { status: "not-a-member" };

  return {
    status: "ok",
    data: {
      room,
      role,
      currentCycle: cycleFor(room),
      rooms: await listRoomsForUser(userId),
      userId,
    },
  };
}
