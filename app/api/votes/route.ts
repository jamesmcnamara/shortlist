import { and, eq, gte, lt } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { nominations, votes } from "@/src/db/schema";

const VOTE_LIMIT = 5;

function currentMonthRange() {
  const now = new Date();
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  };
}

export async function POST(request: Request) {
  return changeVote(request, "add");
}

export async function DELETE(request: Request) {
  return changeVote(request, "remove");
}

async function changeVote(request: Request, action: "add" | "remove") {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const body = await request.json().catch(() => null);
    const nominationId = Number(body?.nominationId);
    if (!Number.isInteger(nominationId)) {
      return Response.json({ error: "A nomination id is required." }, { status: 400 });
    }

    const db = getDb();
    const { start, end } = currentMonthRange();
    const [nomination] = await db.select().from(nominations).where(eq(nominations.id, nominationId)).limit(1);
    if (!nomination) return Response.json({ error: "That nomination no longer exists." }, { status: 404 });
    if (nomination.userId === userId) return Response.json({ error: "You cannot vote for your own nomination." }, { status: 403 });

    if (action === "add") {
      const monthVotes = await db.select().from(votes).where(and(eq(votes.userId, userId), gte(votes.createdAt, start), lt(votes.createdAt, end)));
      if (monthVotes.length >= VOTE_LIMIT) {
        return Response.json({ error: "You have used all 5 votes for this month." }, { status: 409 });
      }
      await db.insert(votes).values({ userId, nominationId });
    } else {
      const [vote] = await db.select().from(votes)
        .where(and(eq(votes.userId, userId), eq(votes.nominationId, nominationId), gte(votes.createdAt, start), lt(votes.createdAt, end)))
        .orderBy(votes.createdAt)
        .limit(1);
      if (!vote) return Response.json({ error: "You have not voted for this movie." }, { status: 409 });
      await db.delete(votes).where(eq(votes.id, vote.id));
    }

    const remainingVotes = await db.select().from(votes).where(and(eq(votes.userId, userId), gte(votes.createdAt, start), lt(votes.createdAt, end)));
    return Response.json({ votesRemaining: Math.max(0, VOTE_LIMIT - remainingVotes.length) });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to update your vote." }, { status: 500 });
  }
}
