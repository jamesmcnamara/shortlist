import { and, desc, eq } from "drizzle-orm";
import { VOTES_PER_MONTH } from "@/app/lib/constants";
import { requireUserId, unauthorized, withUser } from "@/lib/auth/require-user";
import { getMonth } from "@/app/lib/date-utils";
import { getDb, type DB } from "@/src/db/client";
import { nominations, votes, type RawNomination } from "@/src/db/schema";

export interface VoteInput {
  nominationId: number;
}

export const POST = withUser({ error: "Unable to create your vote" })(async (
  request: Request,
  userId: string,
) => {
  const db = getDb();
  const validation = await validate(await request.json(), db, userId, "add");
  if (validation.type === "error") {
    return validation.error;
  }

  const nominationId = validation.nomination.id;

  // Vote
  await db.insert(votes).values({ userId, month: getMonth(), nominationId });

  const nom = await getDb().query.nominations.findFirst({
    where: (n, { eq }) => eq(n.id, nominationId),
    with: {
      movie: true,
      votes: {
        with: { voter: true },
      },
      nomcoms: {
        with: { commenter: true },
        orderBy: (nomcoms, { asc }) => asc(nomcoms.createdAt),
      },
      nominator: true,
    },
    orderBy: (n, { desc }) => desc(n.createdAt),
  });
  return Response.json(nom, { status: 201 });
});

export const DELETE = withUser({ error: "Unable to delete your vote." })(async (
  request: Request,
  userId: string,
) => {
  const db = getDb();
  const validation = await validate(await request.json(), db, userId, "remove");
  if (validation.type === "error") {
    return validation.error;
  }

  const nominationId = validation.nomination.id;

  const [vote] = await db
    .select()
    .from(votes)
    .where(
      and(
        eq(votes.userId, userId),
        eq(votes.nominationId, nominationId),
        eq(votes.month, getMonth()),
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
  return new Response(null, { status: 204 });
});

const validate = async (
  body: VoteInput,
  db: DB,
  userId: string,
  action: "add" | "remove",
): Promise<NominationValidation> => {
  const nominationId = Number(body?.nominationId);
  if (!Number.isInteger(nominationId)) {
    return {
      type: "error",
      error: Response.json(
        { error: "A nomination id is required." },
        { status: 400 },
      ),
    };
  }

  const [nomination] = await db
    .select()
    .from(nominations)
    .where(eq(nominations.id, nominationId))
    .limit(1);

  if (!nomination)
    return {
      type: "error",
      error: Response.json(
        { error: "That nomination no longer exists." },
        { status: 404 },
      ),
    };

  if (nomination.userId === userId) {
    return {
      type: "error",
      error: Response.json(
        { error: "You cannot vote for your own nomination." },
        { status: 403 },
      ),
    };
  }

  if (action === "add") {
    const month = getMonth();
    const monthVotes = await db
      .select()
      .from(votes)
      .where(and(eq(votes.userId, userId), eq(votes.month, month)));

    if (monthVotes.length >= VOTES_PER_MONTH) {
      return {
        type: "error",
        error: Response.json(
          {
            error: `You have used all ${VOTES_PER_MONTH} votes for this month.`,
          },
          { status: 409 },
        ),
      };
    }
  }

  return { type: "success", nomination };
};

type NominationValidation =
  | { type: "error"; error: Response }
  | { type: "success"; nomination: RawNomination };
