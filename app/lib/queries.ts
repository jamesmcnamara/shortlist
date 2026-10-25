import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import {
  nominations,
  seen,
  type Nomination,
  type Person,
} from "@/src/db/schema";

const person = { columns: { id: true, name: true } } as const;

const nominationRelations = {
  movie: true,
  nomcoms: {
    with: { commenter: person },
  },
  nominator: person,
} as const;

/**
 * Seen is a user-level fact, so each public list shows everyone who has marked
 * one of its movies seen.
 */
export async function seenByMovieIds(
  movieIds: number[],
): Promise<Map<number, Person[]>> {
  const byMovie = new Map<number, Person[]>();
  if (movieIds.length === 0) return byMovie;

  const rows = await getDb()
    .select({
      movieId: seen.movieId,
      id: authUsers.id,
      name: authUsers.name,
    })
    .from(seen)
    .innerJoin(authUsers, eq(authUsers.id, seen.userId))
    .where(inArray(seen.movieId, movieIds));

  for (const { movieId, ...user } of rows) {
    const existing = byMovie.get(movieId);
    if (existing) existing.push(user);
    else byMovie.set(movieId, [user]);
  }
  return byMovie;
}

const withSeenBy = async <T extends { movieId: number }>(
  rows: T[],
): Promise<(T & { seenBy: Person[] })[]> => {
  const byMovie = await seenByMovieIds(rows.map((row) => row.movieId));
  return rows.map((row) => ({
    ...row,
    seenBy: byMovie.get(row.movieId) ?? [],
  }));
};

/**
 * Every read is scoped by theatre. Passing the theatre id explicitly, rather than
 * inferring it from the nomination, means a caller cannot accidentally return
 * another theatre's content by id.
 */
export async function listNominations(
  theatreId: string,
): Promise<Nomination[]> {
  const rows = (await getDb().query.nominations.findMany({
    where: (n, { eq }) => eq(n.theatreId, theatreId),
    with: nominationRelations,
    orderBy: (n, { desc }) => desc(n.createdAt),
  })) as Omit<Nomination, "seenBy">[];

  return withSeenBy(rows);
}

export async function listNominationsByTheatreId(
  theatreId: string,
): Promise<Nomination[]> {
  return listNominations(theatreId);
}

export async function getNomination(
  theatreId: string,
  nominationId: number,
): Promise<Nomination | undefined> {
  const row = (await getDb().query.nominations.findFirst({
    where: (n, { and, eq }) =>
      and(eq(n.id, nominationId), eq(n.theatreId, theatreId)),
    with: nominationRelations,
  })) as Omit<Nomination, "seenBy"> | undefined;

  if (!row) return undefined;
  return (await withSeenBy([row]))[0];
}

/** Bare existence check that respects theatre scoping. */
export async function nominationExistsInTheatre(
  theatreId: string,
  nominationId: number,
) {
  const [row] = await getDb()
    .select({ id: nominations.id, userId: nominations.userId })
    .from(nominations)
    .where(
      and(
        eq(nominations.id, nominationId),
        eq(nominations.theatreId, theatreId),
      ),
    )
    .limit(1);
  return row ?? null;
}
