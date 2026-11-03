import { eq, sql } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { movies, nominations, theatres } from "@/src/db/schema";

type Refresh = (
  movieId: number,
  theatreId: string,
) => Promise<{ status: string }>;

interface RefreshOptions {
  theatreId?: string;
  apply?: boolean;
}

export async function runRefresh(
  refresh: Refresh,
  { theatreId, apply = false }: RefreshOptions = {},
): Promise<number> {
  const db = getDb();
  const [theatre] = theatreId
    ? await db
        .select({ name: theatres.name })
        .from(theatres)
        .where(eq(theatres.id, theatreId))
    : [];
  if (theatreId && !theatre)
    throw new Error("Theatre not found in the configured database.");

  const selected = await db
    .select({
      id: movies.id,
      title: sql<string | null>`${movies.details}->>'title'`,
      theatreId: sql<string>`min(${nominations.theatreId}::text)`,
    })
    .from(nominations)
    .innerJoin(movies, eq(nominations.movieId, movies.id))
    .where(theatreId ? eq(nominations.theatreId, theatreId) : undefined)
    .groupBy(movies.id)
    .orderBy(movies.id);
  console.log(
    `${apply ? "Refreshing" : "Would refresh"} ${selected.length} movies ${theatre ? `in "${theatre.name}" (${theatreId})` : "across all theatres"}.`,
  );

  let failed = 0;
  for (const [index, movie] of selected.entries()) {
    const label = `[${index + 1}/${selected.length}] ${movie.title ?? "Untitled"} (${movie.id})`;
    if (!apply) {
      console.log(label);
      continue;
    }
    try {
      const result = await refresh(movie.id, movie.theatreId);
      if (result.status === "updated") {
        console.log(`${label}: updated`);
      } else {
        failed += 1;
        console.error(`${label}: ${result.status}`);
      }
    } catch (error) {
      failed += 1;
      console.error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (apply) {
    console.log(`${selected.length - failed} updated, ${failed} failed.`);
  }
  return failed;
}
