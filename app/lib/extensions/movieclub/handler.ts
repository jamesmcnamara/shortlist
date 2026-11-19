import { extensionData, mergeExtensionData } from "@/app/lib/extensions/data";
import type {
  ExtensionHandler,
  ExtensionHooks,
} from "@/app/lib/extensions/server";
import type { SafeTheatre } from "@/lib/auth/require-theatre";
import { notifyMembers, scheduleNotification } from "@/lib/notifications/push";
import { badRequest, dbId, parseJson } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  movies,
  Nomination,
  nominations,
  theatres,
  type Person,
} from "@/src/db/schema";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { map, mod, set, updateAll, valueOr } from "shades";
import { z } from "zod";
import { closesTomorrow, cycleOf } from "./cycle";
import {
  emptyNominationClubExtensions,
  MovieClubNominationExtension,
  MovieClubTheatreExtension,
  VOTES_PER_MONTH,
} from "./shared";

/** `theatres.extensions.movieclub` */

const voteBody = z.object({
  action: z.enum(["vote", "unvote"], "Choose whether to vote or unvote."),
  nominationId: dbId("Choose a nomination to vote on."),
});

async function clubData(theatreId: string) {
  const [row] = await getDb()
    .select({ extensions: theatres.extensions })
    .from(theatres)
    .where(eq(theatres.id, theatreId));
  return row?.extensions.movieclub ?? {};
}

/** Everyone's votes this month. */
const votesOf = (club: MovieClubTheatreExtension) =>
  club.votes?.[cycleOf(new Date())] ?? {};

const votesThisMonth = async (theatreId: string) =>
  votesOf(await clubData(theatreId));

interface OpenNomination {
  id: number;
  userId: string;
  createdAt: Date;
  title: string | null;
}

const openNominations = (theatreId: string): Promise<OpenNomination[]> =>
  getDb()
    .select({
      id: nominations.id,
      userId: nominations.userId,
      createdAt: nominations.createdAt,
      title: sql<string | null>`${movies.details} ->> 'title'`,
    })
    .from(nominations)
    .innerJoin(movies, eq(movies.id, nominations.movieId))
    .where(
      and(
        eq(nominations.theatreId, theatreId),
        isNull(nominations.completedAt),
      ),
    );

/** Open nominations from this month. Each uses up its nominator's pick. */
const nominationsThisMonth = async (theatreId: string, now = new Date()) =>
  (await openNominations(theatreId)).filter(
    ({ createdAt }) => cycleOf(createdAt) === cycleOf(now),
  );

/** Replaces one member's votes and leaves everyone else's alone. */
async function saveVotes(
  theatreId: string,
  userId: string,
  nominationIds: number[],
) {
  const cycle = cycleOf(new Date());
  const votes = sql`coalesce(${extensionData("movieclub")} -> 'votes', '{}'::jsonb)`;
  const monthVotes = sql`coalesce(${votes} -> ${cycle}::text, '{}'::jsonb)`;
  await getDb()
    .update(theatres)
    .set({
      extensions: mergeExtensionData(
        "movieclub",
        sql`jsonb_build_object(
          'votes', ${votes} || jsonb_build_object(
            ${cycle}::text,
            ${monthVotes} || jsonb_build_object(
              ${userId}::text,
              ${JSON.stringify(nominationIds)}::jsonb
            )
          )
        )`,
      ),
    })
    .where(eq(theatres.id, theatreId));
}

/** The nominations with the most votes, ties included. Nobody leads before the first vote. */
function leadersOf<T extends { id: number }>(
  open: T[],
  votes: Record<string, number[]>,
) {
  const ballots = Object.values(votes).flat();
  const counted = open.map((nomination) => ({
    ...nomination,
    count: ballots.filter((id) => id === nomination.id).length,
  }));
  const most = Math.max(0, ...counted.map(({ count }) => count));
  return counted.filter(({ count }) => most > 0 && count === most);
}

type Leader = OpenNomination & {
  count: number;
};

const leadNotice = (title: string | null, count: number, tied: boolean) => {
  const pick = title ? `Your pick, ${title.slice(0, 200)},` : "Your pick";
  const votes = count === 1 ? "1 vote" : `${count} votes`;
  return `${pick} ${tied ? "is now tied for" : "moved into"} the lead with ${votes}!`;
};

/** Tells new leaders' nominators, unless they caused the change themselves. */
async function notifyNewLeaders(
  theatre: SafeTheatre,
  actorId: string,
  before: Pick<Leader, "id">[],
  after: Leader[],
) {
  const previous = map("id")(before);
  await Promise.all(
    after
      .filter(({ id, userId }) => !previous.includes(id) && userId !== actorId)
      .map(({ id, userId, title, count }) =>
        notifyMembers(
          theatre,
          {
            wants: { extension: "movieclub", category: "lead" },
            only: [userId],
          },
          {
            body: leadNotice(title, count, after.length > 1),
            tag: `movieclub-lead-${id}`,
          },
        ),
      ),
  );
}

/** Reminds members who haven't nominated yet, the day before nominations close. */
async function remindToNominate(theatre: SafeTheatre, now: Date) {
  if (!closesTomorrow(now)) return;
  const nominated = await nominationsThisMonth(theatre.id, now);
  await notifyMembers(
    theatre,
    {
      wants: { extension: "movieclub", category: "reminder" },
      except: map("userId")(nominated),
    },
    {
      body: "You haven't nominated a movie this month. Tomorrow is the last day.",
      tag: `movieclub-reminder-${cycleOf(now)}`,
    },
  );
}

const byName = (a: Person, b: Person) =>
  (a.username ?? a.name).localeCompare(b.username ?? b.name);

const hooks: ExtensionHooks = {
  beforeNominate: async ({ theatre, userId }) => {
    const already = (await nominationsThisMonth(theatre.id)).find(
      (nomination) => nomination.userId === userId,
    );
    return already
      ? `You can only nominate one per month, remove ${already.title}.`
      : null;
  },

  afterNominationChange: async ({ theatre, userId, before, after }) => {
    const [open, votes] = await Promise.all([
      openNominations(theatre.id),
      votesThisMonth(theatre.id),
    ]);
    // Reconstruct the open nominations before this one changed.
    const previous = [
      ...open.filter(({ id }) => id !== after?.id),
      ...(before?.completedAt === null ? [before] : []),
    ];
    scheduleNotification(() =>
      notifyNewLeaders(
        theatre,
        userId,
        leadersOf(previous, votes),
        leadersOf(open, votes),
      ),
    );
  },

  daily: ({ theatre, now }) => remindToNominate(theatre, now),

  decorate: async (theatre, list) => {
    const club = await clubData(theatre.id);
    const votes = votesOf(club);
    const cycle = cycleOf(new Date());
    const pickedMovieId = club.picks?.[cycle];
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
            isPick: nomination.movieId === pickedMovieId,
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
    scheduleNotification(() =>
      notifyNewLeaders(
        theatre,
        userId,
        leadersOf(open, votes),
        leadersOf(open, { ...votes, [userId]: next }),
      ),
    );
    return Response.json({ votesLeft: VOTES_PER_MONTH - next.length });
  },
};
