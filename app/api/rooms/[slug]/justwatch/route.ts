import { and, eq, exists, sql } from "drizzle-orm";
import * as justwatch from "@/app/lib/justwatch";
import type { JustWatchAvailability } from "@/app/lib/justwatch-types";
import { withRoomMember } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { movies, nominations, type MovieDetails } from "@/src/db/schema";

export const runtime = "nodejs";

export const POST = withRoomMember({
  error: "Unable to save JustWatch availability.",
})(async (request, { room }) => {
  const body: unknown = await request.json().catch(() => null);
  const movieId =
    body && typeof body === "object" && "movieId" in body ? body.movieId : null;
  if (
    typeof movieId !== "number" ||
    !Number.isSafeInteger(movieId) ||
    movieId < 1
  ) {
    return Response.json({ error: "A movie id is required." }, { status: 400 });
  }

  const db = getDb();
  const belongsToRoom = exists(
    db
      .select({ id: nominations.id })
      .from(nominations)
      .where(
        and(
          eq(nominations.roomId, room.id),
          eq(nominations.movieId, movies.id),
        ),
      ),
  );
  const [movie] = await db
    .select({ tmdbId: movies.tmdbId, details: movies.details })
    .from(movies)
    .where(and(eq(movies.id, movieId), belongsToRoom))
    .limit(1);
  if (!movie) {
    return Response.json(
      { error: "That movie is not on this list." },
      { status: 404 },
    );
  }
  if (movie.tmdbId === null) {
    return Response.json(
      { error: "That movie has no TMDB id." },
      { status: 400 },
    );
  }

  let availability: JustWatchAvailability;
  try {
    availability = await justwatch.getAvailability(
      movie.tmdbId,
      (movie.details as MovieDetails).title,
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to load JustWatch availability. Try again." },
      { status: 502 },
    );
  }

  const [updated] = await db
    .update(movies)
    .set({
      // Merge only this key so concurrent metadata edits are preserved.
      details: sql`jsonb_set(${movies.details}, '{justWatch}', ${JSON.stringify(availability)}::jsonb)`,
    })
    .where(and(eq(movies.id, movieId), belongsToRoom))
    .returning({ id: movies.id });
  if (!updated) {
    return Response.json(
      { error: "That movie is no longer on this list." },
      { status: 404 },
    );
  }
  return Response.json(availability);
});
