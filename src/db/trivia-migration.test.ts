import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../drizzle/0034_trivia_spoilers.sql", import.meta.url),
  "utf8",
);

it("backfills legacy trivia without changing flags, order, metadata or unrelated movies", async () => {
  const db = new PGlite();
  const metadata = {
    url: "https://www.imdb.com/title/tt0133093/trivia/",
    fetchedAt: "2026-01-01T00:00:00Z",
  };
  const spoiler = { text: "The ending.", spoiler: true };
  const safe = { text: "A casting fact.", spoiler: false };
  const details = [
    {
      title: "Legacy",
      trivia: { ...metadata, items: ["First.\nParagraph.", "Second."] },
    },
    {
      title: "Mixed",
      trivia: { ...metadata, items: [spoiler, "Legacy.", safe] },
    },
    { title: "Current", trivia: { ...metadata, items: [safe, spoiler] } },
    { title: "Empty", trivia: { ...metadata, items: [] } },
    { title: "Never loaded", other: { keep: true } },
    { title: "Null", trivia: null },
    { title: "No items", trivia: metadata },
  ];
  try {
    await db.exec(
      "CREATE TABLE movies (id integer PRIMARY KEY, details jsonb NOT NULL)",
    );
    for (const [id, detail] of details.entries()) {
      await db.query("INSERT INTO movies VALUES ($1, $2)", [
        id,
        JSON.stringify(detail),
      ]);
    }
    await db.exec(migration);
    const { rows } = await db.query<{ details: unknown }>(
      "SELECT details FROM movies ORDER BY id",
    );
    expect(rows.map((row) => row.details)).toEqual([
      {
        ...details[0],
        trivia: {
          ...metadata,
          items: [
            { text: "First.\nParagraph.", spoiler: false },
            { text: "Second.", spoiler: false },
          ],
        },
      },
      {
        ...details[1],
        trivia: {
          ...metadata,
          items: [spoiler, { text: "Legacy.", spoiler: false }, safe],
        },
      },
      ...details.slice(2),
    ]);
    await db.exec(migration);
    expect(
      (await db.query("SELECT details FROM movies ORDER BY id")).rows,
    ).toEqual(rows);
  } finally {
    await db.close();
  }
});
