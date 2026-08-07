import { and, desc, eq } from "drizzle-orm";
import { VOTES_PER_MONTH } from "@/app/lib/constants";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getMonth } from "@/app/lib/date-utils";
import { getDb } from "@/src/db/client";
import { nominations, votes } from "@/src/db/schema";


export async function POST(request: Request) {
  return changeVote(request, "add");
}

export async function DELETE(request: Request) {
  return changeVote(request, "remove");
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    return Response.json(await getDb().select().from(votes).orderBy(desc(votes.createdAt)));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to load votes." }, { status: 500 });
  }
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
    const month = getMonth();
    const [nomination] = await db.select().from(nominations).where(eq(nominations.id, nominationId)).limit(1);
    if (!nomination) return Response.json({ error: "That nomination no longer exists." }, { status: 404 });
    if (nomination.userId === userId) return Response.json({ error: "You cannot vote for your own nomination." }, { status: 403 });

    if (action === "add") {
      const monthVotes = await db.select().from(votes).where(and(eq(votes.userId, userId), eq(votes.month, month)));
      if (monthVotes.length >= VOTES_PER_MONTH) {
        return Response.json({ error: `You have used all ${VOTES_PER_MONTH} votes for this month.` }, { status: 409 });
      }
      const [vote] = await db.insert(votes).values({ userId, month, nominationId }).returning();
      return Response.json(vote, { status: 201 });
    } else {
      const [vote] = await db.select().from(votes)
        .where(and(eq(votes.userId, userId), eq(votes.nominationId, nominationId), eq(votes.month, month)))
        .orderBy(votes.createdAt)
        .limit(1);
      if (!vote) return Response.json({ error: "You have not voted for this movie." }, { status: 409 });
      await db.delete(votes).where(eq(votes.id, vote.id));
      return new Response(null, { status: 204 });
    }
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to update your vote." }, { status: 500 });
  }
}
