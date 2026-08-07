import { eq } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb, type DB } from "@/src/db/client";
import { movies } from "@/src/db/schema";

export const runtime = "nodejs";

async function withDB(handler: (db: DB) => Promise<Response>) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();
  try {
    const db = getDb();
    return handler(db);

  } catch (error) {
    console.error(error);
    return json({ error: "The database request failed. Check your DATABASE_URL and migration." }, 500);
  }
}

export async function GET(_: Request) {
  return withDB(async db => {
      return json(await db.select().from(movies));
  });
}

export async function POST(request: Request) {
  return withDB(async db => {
      const body = await request.json().catch(() => null);
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const year = body?.year === undefined || body?.year === null || body?.year === ""
        ? null
        : Number(body.year);
      const tmdbId = body?.tmdbId === undefined || body?.tmdbId === null || body?.tmdbId === ""
        ? null
        : Number(body.tmdbId);
      const posterUrl = typeof body?.posterUrl === "string" ? body.posterUrl : null;
      const description = typeof body?.description === "string" ? body.description : null;
      const tmdbRating = body?.tmdbRating === undefined || body?.tmdbRating === null || body?.tmdbRating === ""
        ? null
        : Number(body.tmdbRating);

      if (
        !title ||
        (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2200)) ||
        (tmdbId !== null && !Number.isInteger(tmdbId))
      ) {
        return json({ error: "Enter a movie title and an optional valid year." }, 400);
      }

      const [movie] = await db.insert(movies).values({ title, year, tmdbId, posterUrl, description, tmdbRating }).returning();
      return json(movie, 201);
  });
}

export async function DELETE(request: Request) {
  return withDB(async db => {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id)) {
        return json({ error: "A movie id is required." }, 400);
      }

      await db.delete(movies).where(eq(movies.id, id));
      return new Response(null, { status: 204 });
  })
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}