import { eq } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { tags, theatres, theatreTags } from "@/src/db/schema";
import * as tagsutils from "./tags";

export async function listTheatreTags(theatreId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ tag: theatreTags.tag })
    .from(theatreTags)
    .where(eq(theatreTags.theatreId, theatreId))
    .orderBy(theatreTags.tag);
  return rows.map(({ tag }) => tag);
}

export async function updateTheatre(
  theatreId: string,
  input: { name?: string; description?: string },
): Promise<void> {
  const db = getDb();
  const { name, description } = input;
  const update = db
    .update(theatres)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined
        ? { description: description || null }
        : {}),
    })
    .where(eq(theatres.id, theatreId));

  if (description === undefined) {
    await update;
    return;
  }

  const names = tagsutils.extract(description);
  const clear = db
    .delete(theatreTags)
    .where(eq(theatreTags.theatreId, theatreId));

  // Lock the theatre first so concurrent saves replace tags in description order.
  if (names.length === 0) {
    await db.batch([update, clear]);
  } else {
    await db.batch([
      update,
      db
        .insert(tags)
        .values(names.map((name) => ({ name })))
        .onConflictDoNothing(),
      clear,
      db.insert(theatreTags).values(names.map((tag) => ({ theatreId, tag }))),
    ]);
  }
}
