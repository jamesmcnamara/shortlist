import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withUser } from "@/lib/auth/require-user";
import { generateInviteCode } from "@/app/lib/rooms";
import { roomPath } from "@/lib/room-path";
import { getDb } from "@/src/db/client";
import { nominations, roomMembers, rooms } from "@/src/db/schema";
import {
  listRoomsWithPosterPreviewsForUser,
  recentActivityOrder,
} from "@/app/lib/load-room";
import {
  badRequest,
  dbIdParam,
  parseJson,
  requiredText,
} from "@/lib/validation";

export const runtime = "nodejs";

const createBody = z.object({ name: requiredText("A room name is required.") });

/**
 * Rooms the caller belongs to, for the switcher, the landing redirect, and
 * (with `?movieId=`) the "add to a list" picker, which needs to know which of
 * those rooms already carry the movie.
 */
export const GET = withUser({ error: "Unable to load your rooms." })(async (
  request: Request,
  userId: string,
) => {
  const params = new URL(request.url).searchParams;
  if (params.get("previews") === "true") {
    return Response.json(await listRoomsWithPosterPreviewsForUser(userId));
  }
  const movieId = dbIdParam("Invalid movie id.").safeParse(
    params.get("movieId"),
  ).data;

  const memberships = await getDb()
    .select({
      id: rooms.id,
      name: rooms.name,
      watchlistFor: rooms.watchlistFor,
      role: roomMembers.role,
      joinedAt: roomMembers.joinedAt,
      hasMovie: sql<boolean>`${nominations.id} is not null`,
    })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .leftJoin(
      nominations,
      and(
        eq(nominations.roomId, rooms.id),
        eq(nominations.movieId, movieId ?? -1),
      ),
    )
    .where(eq(roomMembers.userId, userId))
    .orderBy(...recentActivityOrder);

  if (!movieId) {
    return Response.json(memberships.map(({ hasMovie, ...room }) => room));
  }

  return Response.json(memberships);
});

export const POST = withUser({ error: "Unable to create the room." })(async (
  request: Request,
  userId: string,
) => {
  const parsed = await parseJson(request, createBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { name } = parsed.data;

  const db = getDb();
  const [room] = await db
    .insert(rooms)
    .values({
      name,
      createdBy: userId,
      inviteCode: generateInviteCode(),
      adminInviteCode: generateInviteCode(),
    })
    .returning();

  await db
    .insert(roomMembers)
    .values({ roomId: room.id, userId, role: "admin" });

  // The creator is an admin and can read the code from the settings page; it
  // is withheld here so no response carries it incidentally.
  const {
    inviteCode: _withheldMember,
    adminInviteCode: _withheldAdmin,
    ...safe
  } = room;
  return Response.json({ ...safe, path: roomPath(room) }, { status: 201 });
});
