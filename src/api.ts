import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "./db/client";
import { movies, nominations, votes } from "./db/schema";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function movieApi(request: Request, userId: string): Promise<Response> {
  try {
    const db = getDb();
    const { start, end } = currentMonthRange();

    if (request.method === "GET") {
      const [items, monthNominations, monthVotes, myVotes] = await Promise.all([
        db.select().from(movies).orderBy(desc(movies.createdAt)),
        db.select().from(nominations).where(and(gte(nominations.createdAt, start), lt(nominations.createdAt, end))),
        db.select().from(votes).where(and(gte(votes.createdAt, start), lt(votes.createdAt, end))),
        db.select().from(votes).where(and(eq(votes.userId, userId), gte(votes.createdAt, start), lt(votes.createdAt, end)))
      ]);
      const nominationByMovie = new Map(monthNominations.map((nomination) => [nomination.movieId, nomination]));
      const voteCounts = new Map<number, number>();
      const myVoteCounts = new Map<number, number>();
      for (const vote of monthVotes) voteCounts.set(vote.nominationId, (voteCounts.get(vote.nominationId) ?? 0) + 1);
      for (const vote of myVotes) myVoteCounts.set(vote.nominationId, (myVoteCounts.get(vote.nominationId) ?? 0) + 1);

      return json(items.map((movie) => {
        const nomination = nominationByMovie.get(movie.id);
        return {
          ...movie,
          nominationId: nomination?.id ?? null,
          nominatedByMe: nomination?.userId === userId,
          voteCount: nomination ? voteCounts.get(nomination.id) ?? 0 : 0,
          myVoteCount: nomination ? myVoteCounts.get(nomination.id) ?? 0 : 0
        };
      }));
    }

    if (request.method === "POST") {
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

      const existingNomination = await db.select().from(nominations)
        .where(and(eq(nominations.userId, userId), gte(nominations.createdAt, start), lt(nominations.createdAt, end)))
        .limit(1);
      if (existingNomination.length > 0) {
        return json({ error: "You can nominate one movie per month." }, 409);
      }

      const [movie] = await db.insert(movies).values({ title, year, tmdbId, posterUrl, description, tmdbRating }).returning();
      const [nomination] = await db.insert(nominations).values({ userId, movieId: movie.id }).returning();
      return json({ ...movie, nominationId: nomination.id, nominatedByMe: true, voteCount: 0, myVoteCount: 0 }, 201);
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
