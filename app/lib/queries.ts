import { and, eq } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { nominations, type Nomination } from "@/src/db/schema";

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
 * Every read is scoped by room. Passing the room id explicitly, rather than
 * inferring it from the nomination, means a caller cannot accidentally return
 * another room's content by id.
 */
export function listNominations(roomId: string) {
  return getDb().query.nominations.findMany({
    where: (n, { eq }) => eq(n.roomId, roomId),
    with: nominationRelations,
    orderBy: (n, { desc }) => desc(n.createdAt),
  }) as Promise<Nomination[]>;
}

export function getNomination(roomId: string, nominationId: number) {
  return getDb().query.nominations.findFirst({
    where: (n, { and, eq }) =>
      and(eq(n.id, nominationId), eq(n.roomId, roomId)),
    with: nominationRelations,
  }) as Promise<Nomination | undefined>;
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
