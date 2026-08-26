import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  nominations,
  roomMembers,
  seen,
  type Nomination,
  type User,
} from "@/src/db/schema";

const nominationRelations = {
  movie: true,
  votes: {
    with: { voter: true },
  },
  nomcoms: {
    with: { commenter: true },
  },
  nominator: true,
} as const;

/**
 * Seen is a user-level fact, so it is joined against the room's membership
 * here: a nomination only reports the people in *this* room who have seen it,
 * never someone's viewing history from a room you do not share.
 */
async function seenByRoomMembers(
  roomId: string,
  movieIds: number[],
): Promise<Map<number, User[]>> {
  const byMovie = new Map<number, User[]>();
  if (movieIds.length === 0) return byMovie;

  const rows = await getDb()
    .select({
      movieId: seen.movieId,
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
    })
    .from(seen)
    .innerJoin(authUsers, eq(authUsers.id, seen.userId))
    .innerJoin(
      roomMembers,
      and(eq(roomMembers.userId, seen.userId), eq(roomMembers.roomId, roomId)),
    )
    .where(inArray(seen.movieId, movieIds));

  for (const { movieId, ...user } of rows) {
    const existing = byMovie.get(movieId);
    if (existing) existing.push(user);
    else byMovie.set(movieId, [user]);
  }
  return byMovie;
}

const withSeenBy = async <T extends { movieId: number }>(
  roomId: string,
  rows: T[],
): Promise<(T & { seenBy: User[] })[]> => {
  const byMovie = await seenByRoomMembers(
    roomId,
    rows.map((row) => row.movieId),
  );
  return rows.map((row) => ({ ...row, seenBy: byMovie.get(row.movieId) ?? [] }));
};

/**
 * Every read is scoped by room. Passing the room id explicitly, rather than
 * inferring it from the nomination, means a caller cannot accidentally return
 * another room's content by id.
 */
export async function listNominations(roomId: string): Promise<Nomination[]> {
  const rows = (await getDb().query.nominations.findMany({
    where: (n, { eq }) => eq(n.roomId, roomId),
    with: nominationRelations,
    orderBy: (n, { desc }) => desc(n.createdAt),
  })) as Omit<Nomination, "seenBy">[];

  return withSeenBy(roomId, rows);
}

export async function getNomination(
  roomId: string,
  nominationId: number,
): Promise<Nomination | undefined> {
  const row = (await getDb().query.nominations.findFirst({
    where: (n, { and, eq }) =>
      and(eq(n.id, nominationId), eq(n.roomId, roomId)),
    with: nominationRelations,
  })) as Omit<Nomination, "seenBy"> | undefined;

  if (!row) return undefined;
  return (await withSeenBy(roomId, [row]))[0];
}

/** Bare existence check that respects room scoping. */
export async function nominationExistsInRoom(
  roomId: string,
  nominationId: number,
) {
  const [row] = await getDb()
    .select({ id: nominations.id, userId: nominations.userId })
    .from(nominations)
    .where(
      and(eq(nominations.id, nominationId), eq(nominations.roomId, roomId)),
    )
    .limit(1);
  return row ?? null;
}
