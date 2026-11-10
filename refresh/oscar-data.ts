import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { sql } from "drizzle-orm";
import type { OscarMovie, Oscars } from "@/app/lib/data/oscars";
import { addMovie } from "@/app/lib/add-movie";
import { MdbRateLimitError } from "@/app/lib/movie-metadata";
import { getDb } from "@/src/db/client";
import { movies } from "@/src/db/schema";

const MDB_COOLDOWN_MS = 5 * 60 * 1000;

async function importMovie(imdbId: string): Promise<number> {
  for (;;) {
    try {
      return (await addMovie({ kind: "imdb", id: imdbId })).id;
    } catch (error) {
      if (!(error instanceof MdbRateLimitError)) throw error;
      console.warn(
        `${imdbId}: MDBList rate limit reached. Waiting 5 minutes before retrying this movie.`,
      );
      await sleep(MDB_COOLDOWN_MS);
    }
  }
}

export async function refreshOscars({
  apply = false,
  file = new URL("../public/data/oscars.json", import.meta.url),
} = {}): Promise<number> {
  const data: Oscars = JSON.parse(await readFile(file, "utf8"));
  const stored = await getDb()
    .select({
      id: movies.id,
      imdbId: sql<
        string | null
      >`coalesce(nullif(${movies.details}->>'imdb_id', ''), ${movies.ratings}->'raw'->'ids'->>'imdb')`,
      hasMojo: sql<boolean>`jsonb_typeof(${movies.boxOffice}->'boxofficemojo') = 'object'`,
    })
    .from(movies);
  const ids = new Map(stored.map(({ id, imdbId }) => [imdbId, id]));
  const enriched = new Set(
    stored.filter(({ hasMojo }) => hasMojo).map(({ imdbId }) => imdbId),
  );
  const entries = Object.entries(data.movies);
  console.log(
    `${apply ? "Importing" : "Would import"} ${entries.length} Oscar movies and link their Shortlist IDs.`,
  );

  const updated: Record<string, OscarMovie> = {};
  let failed = 0;
  for (const [index, [imdbId, awards]] of entries.entries()) {
    const label = `[${index + 1}/${entries.length}] ${imdbId}`;
    // IDs belong to the configured database, not necessarily the previous run's.
    const { shortlistId: previousId, ...unlinked } = awards;
    updated[imdbId] = unlinked;
    try {
      let id = ids.get(imdbId);
      // Movies with Mojo data are already fully added; skip refetching them.
      if (apply && !enriched.has(imdbId)) id = await importMovie(imdbId);
      if (id !== undefined) {
        updated[imdbId] = { ...unlinked, shortlistId: id };
      }
      console.log(
        `${label}: ${id === undefined ? "would import" : `Shortlist ${id}`}`,
      );
    } catch (error) {
      failed += 1;
      console.error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (apply) {
    await writeFile(
      file,
      JSON.stringify({ ...data, movies: updated }, null, 2),
    );
    console.log(`${entries.length - failed} linked, ${failed} failed.`);
  }
  return failed;
}
