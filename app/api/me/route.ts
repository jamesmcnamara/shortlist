import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { movies, nominations, votes } from "@/src/db/schema";

export const runtime = "nodejs";

function currentMonthRange() {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  };
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const db = getDb();
    const { start, end } = currentMonthRange();
    const [{ totalVotes }] = await db
      .select({ totalVotes: count() })
      .from(votes)
      .where(and(eq(votes.userId, userId), gte(votes.createdAt, start), lt(votes.createdAt, end)));
    const [nomination] = await db
      .select({ id: nominations.id, movieId: movies.id, title: movies.title })
      .from(nominations)
      .innerJoin(movies, eq(movies.id, nominations.movieId))
      .where(and(eq(nominations.userId, userId), gte(nominations.createdAt, start), lt(nominations.createdAt, end)))
      .orderBy(desc(nominations.createdAt))
      .limit(1);

    const usedVotes = Number(totalVotes);
    return Response.json({
      voteLimit: 5,
      votesUsed: usedVotes,
      votesRemaining: Math.max(0, 5 - usedVotes),
      nomination: nomination ?? null
    });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to load your shortlist profile." }, { status: 500 });
  }
}
