import { extensionData, mergeExtensionData } from "@/app/lib/extensions/data";
import type {
  ExtensionHandler,
  ExtensionHooks,
} from "@/app/lib/extensions/server";
import { badRequest, dbId, parseJson } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { movies, nominations, theatres, type Person } from "@/src/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { map } from "shades";
import { z } from "zod";
import { cycleOf } from "./cycle";
import { VOTES_PER_MONTH } from "./shared";

/** `theatres.extensions.movieclub`: one nomination id per vote, grouped by user for `cycle`. */
interface ClubData {
  cycle?: string;
  votes?: Record<string, number[]>;
}

const voteBody = z.object({
  action: z.enum(["vote", "unvote"], "Choose whether to vote or unvote."),
  nominationId: dbId("Choose a nomination to vote on."),
});

/** Everyone's votes this month. Votes from an earlier month don't count. */
async function votesThisMonth(
  theatreId: string,
): Promise<Record<string, number[]>> {
  const [row] = await getDb()
    .select({ extensions: theatres.extensions })
    .from(theatres)
    .where(eq(theatres.id, theatreId));
  const club = (row?.extensions.movieclub ?? {}) as ClubData;
  return club.cycle === cycleOf(new Date()) ? (club.votes ?? {}) : {};
}

const openNominations = (theatreId: string) =>
  getDb()
    .select({ id: nominations.id, userId: nominations.userId })
    .from(nominations)
    .where(
      and(
        eq(nominations.theatreId, theatreId),
        isNull(nominations.completedAt),
      ),
    );

/** Replaces one member's votes and leaves everyone else's alone. */
async function saveVotes(
  theatreId: string,
  userId: string,
  nominationIds: number[],
) {
  const cycle = cycleOf(new Date());
  const club = extensionData("movieclub");
  // The first write of a new month starts everyone over.
  const currentVotes = sql`(
    case when ${club} ->> 'cycle' = ${cycle}::text
    then coalesce(${club} -> 'votes', '{}'::jsonb)
    else '{}'::jsonb end
  )`;
  await getDb()
    .update(theatres)
    .set({
      extensions: mergeExtensionData(
        "movieclub",
        sql`jsonb_build_object(
          'cycle', ${cycle}::text,
          'votes', jsonb_set(
            ${currentVotes},
            array[${userId}::text],
            ${JSON.stringify(nominationIds)}::jsonb
          )
        )`,
      ),
    })
    .where(eq(theatres.id, theatreId));
}

const byName = (a: Person, b: Person) =>
  (a.username ?? a.name).localeCompare(b.username ?? b.name);

const hooks: ExtensionHooks = {
  beforeNominate: async ({ theatre, userId }) => {
    const mine = await getDb()
      .select({
        createdAt: nominations.createdAt,
        title: sql<string>`${movies.details} ->> 'title'`,
      })
      .from(nominations)
      .innerJoin(movies, eq(movies.id, nominations.movieId))
      .where(
        and(
          eq(nominations.theatreId, theatre.id),
          eq(nominations.userId, userId),
          isNull(nominations.completedAt),
        ),
      );
    const thisMonth = cycleOf(new Date());
    const already = mine.find(
      ({ createdAt }) => cycleOf(createdAt) === thisMonth,
    );
    return already
      ? `You can only nominate one per month, remove ${already.title}.`
      : null;
  },

  decorate: async (theatre, list) => {
    const votes = await votesThisMonth(theatre.id);
    const voterIds = Object.keys(votes);
    const people = voterIds.length
      ? await getDb()
          .select({
            id: authUsers.id,
            name: authUsers.name,
            username: authUsers.username,
          })
          .from(authUsers)
          .where(inArray(authUsers.id, voterIds))
      : [];

    return list.map((nomination) => {
      const voters = nomination.completedAt
        ? []
        : people
            .flatMap((person) =>
              votes[person.id]
                .filter((id) => id === nomination.id)
                .map(() => person),
            )
            .sort(byName);
      return {
        ...nomination,
        extensions: {
          ...(nomination.extensions ?? {}),
          movieclub: {
            ...(nomination.extensions?.movieclub ?? {}),
            voters,
          },
        },
      };
    });
  },
};

/**
 * Movie club lists: every member gets a few votes and one nomination a month.
 * Voting happens here; the nomination limit is enforced by the hook above.
 */
export const movieclub: ExtensionHandler = {
  access: "member",
  error: "Unable to vote.",
  hooks,
  handle: async (request, { theatre, userId }) => {
    const parsed = await parseJson(request, voteBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { action, nominationId } = parsed.data;

    const [open, votes] = await Promise.all([
      openNominations(theatre.id),
      votesThisMonth(theatre.id),
    ]);
    const openIds = map("id")(open);
    // Votes for deleted or completed nominations are given back.
    const mine = (votes[userId] ?? []).filter((id) => openIds.includes(id));

    if (action === "vote") {
      const target = open.find(({ id }) => id === nominationId);
      if (!target) {
        return Response.json(
          { error: "That nomination no longer exists." },
          { status: 404 },
        );
      }
      if (target.userId === userId) {
        return Response.json(
          { error: "You can't vote for your own nomination." },
          { status: 400 },
        );
      }
      if (mine.length >= VOTES_PER_MONTH) {
        return Response.json(
          { error: "You're out of votes this month." },
          { status: 409 },
        );
      }
    }

    const voteIndex = mine.indexOf(nominationId);
    const next =
      action === "vote"
        ? [...mine, nominationId]
        : mine.filter((_, index) => index !== voteIndex);
    await saveVotes(theatre.id, userId, next);
    return Response.json({ votesLeft: VOTES_PER_MONTH - next.length });
  },
};
