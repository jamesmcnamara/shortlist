import { and, eq, exists, sql } from "drizzle-orm";
import { z } from "zod";
import { getWikipediaUrl } from "@/app/lib/wikipedia";
import { withTheatreUser } from "@/lib/auth/require-theatre";
import { badRequest, dbId, parseJson } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";

export const runtime = "nodejs";

const refreshBody = z.object({ movieId: dbId("A movie id is required.") });
const detailsSchema = z.object({ imdb_id: z.string().nullish() });

export const POST = withTheatreUser({
  error: "Unable to save Wikipedia article.",
})(async (request, { theatre }) => {
  const parsed = await parseJson(request, refreshBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { movieId } = parsed.data;

  const db = getDb();
  const belongsToTheatre = exists(
    db
      .select({ id: nominations.id })
      .from(nominations)
      .where(
        and(
          eq(nominations.theatreId, theatre.id),
          eq(nominations.movieId, movies.id),
        ),
      ),
  );
  const condition = and(eq(movies.id, movieId), belongsToTheatre);
  const [movie] = await db
    .select({ tmdbId: movies.tmdbId, details: movies.details })
    .from(movies)
    .where(condition)
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

  let wikipediaUrl: string | null;
  try {
    const { imdb_id } = detailsSchema.parse(movie.details);
    wikipediaUrl =
      (await getWikipediaUrl(movie.tmdbId, imdb_id ?? undefined)) ?? null;
  } catch (error) {
    console.error("Unable to load Wikipedia article.", error);
    return Response.json(
      { error: "Couldn't load Wikipedia article. Try again." },
      { status: 502 },
    );
  }

  const [updated] = await db
    .update(movies)
    .set({
      // Merge only this key so concurrent metadata edits are preserved.
      details: sql`jsonb_set(${movies.details}, '{wikipediaUrl}', ${JSON.stringify(wikipediaUrl)}::jsonb)`,
    })
    .where(condition)
    .returning({ id: movies.id });
  if (!updated) {
    return Response.json(
      { error: "That movie is no longer on this list." },
      { status: 404 },
    );
  }
  return Response.json({ wikipediaUrl });
});
