import { TMDB } from "@lorenzopant/tmdb";
import { and, eq } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getMonth } from "@/app/lib/date-utils";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";

export const runtime = "nodejs";

const tmdb = new TMDB(
  process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "",
  {
    language: "en-US",
  },
);

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await request.json().catch(() => null);
  const tmdbId = Number(body?.tmdbId);
  if (!Number.isInteger(tmdbId)) {
    return Response.json(
      { error: "A TMDB movie id is required." },
      { status: 400 },
    );
  }
  const comment =
    typeof body?.comment === "string" && body.comment.trim()
      ? body.comment.trim()
      : null;

  if (!process.env.TMDB_API_READ_ACCESS_TOKEN && !process.env.TMDB_API_KEY) {
    return Response.json(
      { error: "TMDB credentials are not configured." },
      { status: 500 },
    );
  }

  const month = getMonth();
  const db = getDb();

  if (process.env.ALLOW_MULTIPLE_NOMINATIONS !== "true") {
    try {
      const existing = await db
        .select()
        .from(nominations)
        .where(
          and(eq(nominations.userId, userId), eq(nominations.month, month)),
        )
        .limit(1);
      if (existing.length > 0) {
        return Response.json(
          { error: "You can nominate one movie per month." },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: "Unable to create the nomination." },
        { status: 500 },
      );
    }
  }

  let details;
  try {
    details = await tmdb.movies.details({ movie_id: tmdbId });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to load that movie from TMDB right now." },
      { status: 502 },
    );
  }

  try {
    const values = {
      tmdbId: details.id,
      title: details.title,
      posterUrl: details.poster_path
        ? tmdb.images.poster(details.poster_path, "w342")
        : null,
      description: details.overview ?? null,
      year: details.release_date
        ? Number(details.release_date.slice(0, 4)) || null
        : null,
      runtime: details.runtime ?? null,
      tmdbRating: details.vote_average || null,
    };

    const [movie] = await db
      .insert(movies)
      .values(values)
      .onConflictDoUpdate({ target: movies.tmdbId, set: values })
      .returning();

    const [nomination] = await db
      .insert(nominations)
      .values({
        userId,
        month,
        movieId: movie.id,
        comment,
      })
      .returning();

    return Response.json({ movie, nomination }, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to create the nomination." },
      { status: 500 },
    );
  }
}
