import { desc, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { movies } from "./db/schema";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function movieApi(request: Request): Promise<Response> {
  try {
    const db = getDb();

    if (request.method === "GET") {
      const items = await db.select().from(movies).orderBy(desc(movies.createdAt));
      return json(items);
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const year = body?.year === undefined || body?.year === null || body?.year === ""
        ? null
        : Number(body.year);

      if (!title || (year !== null && (!Number.isInteger(year) || year < 1888 || year > 2200))) {
        return json({ error: "Enter a movie title and an optional valid year." }, 400);
      }

      const [movie] = await db.insert(movies).values({ title, year }).returning();
      return json(movie, 201);
    }

    if (request.method === "DELETE") {
      const id = Number(new URL(request.url).searchParams.get("id"));
      if (!Number.isInteger(id)) {
        return json({ error: "A movie id is required." }, 400);
      }

      await db.delete(movies).where(eq(movies.id, id));
      return new Response(null, { status: 204 });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error(error);
    return json({ error: "The database request failed. Check your DATABASE_URL and migration." }, 500);
  }
}
