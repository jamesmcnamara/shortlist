import { and, eq, sql } from "drizzle-orm";
import { cycleFor } from "@/app/lib/cycles";
import { getNomination, nominationExistsInRoom } from "@/app/lib/queries";
import { withRoomMember, type RoomContext } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { votes } from "@/src/db/schema";

export const runtime = "nodejs";

export interface VoteInput {
  nominationId: number;
}

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
    // cast, not distinct nominations voted for. Counting inside the INSERT
    // narrows the check-then-insert window to a single statement, which is
    // what makes a double-click safe. It does not fully close it: under READ
    // COMMITTED two genuinely concurrent statements can take snapshots before
    // either commits and both pass. Closing that needs a row lock in a
    // transaction, which this HTTP driver cannot hold across statements.
    const inserted = await db.execute(sql`
      insert into ${votes} (room_id, user_id, nomination_id, cycle)
      select ${room.id}, ${userId}, ${nominationId}, ${cycle}
      where (
        select count(*)
        from ${votes}
        where ${votes.roomId} = ${room.id}
          and ${votes.userId} = ${userId}
          and ${votes.cycle} = ${cycle}
      ) < ${room.votesPerCycle}
      returning id
    `);

    const rows = (inserted as unknown as { rows: { id: number }[] }).rows ?? [];
    if (rows.length === 0) {
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
