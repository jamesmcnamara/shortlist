import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import * as tags from "../app/lib/tags.ts";

export async function backfillTheatreTags(sql, apply = false) {
  const rows = await sql`SELECT id, description FROM theatres ORDER BY id`;
  if (!apply) return rows.length;

  for (const { id, description } of rows) {
    const names = tags.extract(description ?? "");
    // Lock first; guards skip a description changed since the initial read.
    await sql.transaction([
      sql`SELECT id FROM theatres WHERE id = ${id} FOR UPDATE`,
      sql`
        INSERT INTO tags (name)
        SELECT unnest(${names}::text[]) FROM theatres
        WHERE id = ${id} AND description IS NOT DISTINCT FROM ${description}
        ON CONFLICT DO NOTHING`,
      sql`
        DELETE FROM theatre_tags
        WHERE theatre_id = ${id} AND EXISTS (
          SELECT 1 FROM theatres WHERE id = ${id}
          AND description IS NOT DISTINCT FROM ${description}
        )`,
      sql`
        INSERT INTO theatre_tags (theatre_id, tag)
        SELECT id, unnest(${names}::text[]) FROM theatres
        WHERE id = ${id} AND description IS NOT DISTINCT FROM ${description}`,
    ]);
  }
  return rows.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const apply = process.argv.includes("--apply");
  const count = await backfillTheatreTags(
    neon(process.env.DATABASE_URL),
    apply,
  );
  console.log(`${apply ? "Processed" : "Would process"} ${count} theatres.`);
}
