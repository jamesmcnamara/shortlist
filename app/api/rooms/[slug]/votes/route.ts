import { and, eq, inArray } from "drizzle-orm";
import { cycleFor } from "@/app/lib/cycles";
import { getNomination, nominationExistsInRoom } from "@/app/lib/queries";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb, type DB } from "@/src/db/client";
import { nominations, votes } from "@/src/db/schema";

export const runtime = "nodejs";

export interface VoteInput {
  nominationId: number;
}

/**
 * Only votes cast on nominations still awaiting a verdict count against a
 * room's per-cycle budget; once a nomination is marked completed and moves
 * to Watched, votes on it are released back to the voter.
 */
const activeVoteCount = (
  db: DB,
  roomId: string,
  userId: string,
  cycle: number,
) =>
  db.$count(
    votes,
    and(
      eq(votes.roomId, roomId),
      eq(votes.userId, userId),
      eq(votes.cycle, cycle),
      inArray(
        votes.nominationId,
        db
          .select({ id: nominations.id })
          .from(nominations)
          .where(eq(nominations.completed, false)),
      ),
    ),
  );

export const POST = withRoomMember({ error: "Unable to create your vote" })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const nominationId = Number(body?.nominationId);
    if (!Number.isInteger(nominationId)) {
      return Response.json(
        { error: "A nomination id is required." },
        { status: 400 },
      );
    }

    const nomination = await nominationExistsInRoom(room.id, nominationId);
    if (!nomination) {
      return Response.json(
        { error: "That nomination no longer exists." },
        { status: 404 },
      );
    }

    if (nomination.userId === userId && !room.allowSelfVote) {
      return Response.json(
        { error: "You cannot vote for your own nomination." },
        { status: 403 },
      );
    }

    const db = getDb();
    const cycle = cycleFor(room);

    // Votes may be stacked on a single nomination, so the budget counts votes
    // cast, not distinct nominations voted for. The neon-http driver has no
    // transaction support to hold a lock across statements, so the row is
    // inserted first and the budget is re-asserted immediately after;
    // exceeding it deletes the row it just inserted. This narrows the race
    // window to the gap between the insert and the delete rather than
    // eliminating it — under READ COMMITTED two genuinely concurrent
    // requests could still both pass before either commits.
    const [inserted] = await db
      .insert(votes)
      .values({ roomId: room.id, userId, nominationId, cycle })
      .returning({ id: votes.id });

    if (
      (await activeVoteCount(db, room.id, userId, cycle)) > room.votesPerCycle
    ) {
      await db.delete(votes).where(eq(votes.id, inserted.id));
      return Response.json(
        {
          error: `You have used all ${room.votesPerCycle} of your votes for this cycle.`,
        },
        { status: 409 },
      );
    }

    return Response.json(await getNomination(room.id, nominationId), {
      status: 201,
    });
  },
);

export const DELETE = withRoomMember({ error: "Unable to delete your vote." })(
  async (request: Request, { room, userId }: RoomContext) => {
    const body = await request.json().catch(() => null);
    const nominationId = Number(body?.nominationId);
    if (!Number.isInteger(nominationId)) {
      return Response.json(
        { error: "A nomination id is required." },
        { status: 400 },
      );
    }

    const nomination = await nominationExistsInRoom(room.id, nominationId);
    if (!nomination) {
      return Response.json(
        { error: "That nomination no longer exists." },
        { status: 404 },
      );
    }

    const db = getDb();
    // Stacked votes are removed one at a time, oldest first.
    const [vote] = await db
      .select()
      .from(votes)
      .where(
        and(
          eq(votes.roomId, room.id),
          eq(votes.userId, userId),
          eq(votes.nominationId, nominationId),
          eq(votes.cycle, cycleFor(room)),
        ),
      )
      .orderBy(votes.createdAt)
      .limit(1);

    if (!vote)
      return Response.json(
        { error: "You have not voted for this movie." },
        { status: 409 },
      );

    await db.delete(votes).where(eq(votes.id, vote.id));

    return Response.json(await getNomination(room.id, nominationId), {
      status: 200,
    });
  },
);
