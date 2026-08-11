import { getMonth } from "@/app/lib/date-utils";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { movies, nominations, } from "@/src/db/schema";
import { TMDB } from "@lorenzopant/tmdb";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const tmdb = new TMDB(
  process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "",
  {
    language: "en-US",
  },
);


export async function GET () {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    return Response.json(
      await getDb().query.nominations.findMany({
        with: {
          movie: true,
          votes: true,
          nomcoms: {
            with: { commenter: true },
            orderBy: (nomcoms, { asc }) => asc(nomcoms.createdAt),
          },
          nominator: true,
        },
        orderBy: (n, { desc }) => desc(n.createdAt),
      }),
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to load nominations." },
      { status: 500 },
    );
  }
}

export async function POST (request: Request) {
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

    const full = await db.query.nominations.findFirst({
      where: (n, { eq }) => eq(n.id, nomination.id),
      with: {
        movie: true,
        votes: true,
        nomcoms: {
          with: { commenter: true },
          orderBy: (nomcoms, { asc }) => asc(nomcoms.createdAt),
        },
        nominator: true,
      },
    });

    return Response.json(full, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to create the nomination." },
      { status: 500 },
    );
  }
}

export async function DELETE (request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) {
      return Response.json(
        { error: "A nomination id is required." },
        { status: 400 },
      );
    }

    const deleted = await getDb()
      .delete(nominations)
      .where(and(eq(nominations.id, id), eq(nominations.userId, userId)))
      .returning({ id: nominations.id });
    if (deleted.length === 0)
      return Response.json(
        { error: "That nomination no longer exists." },
        { status: 404 },
      );
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to delete the nomination." },
      { status: 500 },
    );
  }
}
