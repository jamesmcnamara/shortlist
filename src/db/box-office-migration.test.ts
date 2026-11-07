import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { resolveBoxOffice, type BoxOfficeSources } from "@/app/lib/box-office";

const migration = readFileSync(
  new URL("../../drizzle/0030_flimsy_hitman.sql", import.meta.url),
  "utf8",
);
const figures = {
  source: "boxofficemojo",
  url: "https://www.boxofficemojo.com/title/tt0816692/",
  fetchedAt: "2026-11-06T00:00:00Z",
  currency: "USD",
  budget: 100,
  domesticGross: 200,
  internationalGross: 300,
  worldwideGross: 500,
};

describe("box office source migration", () => {
  it("backfills source provenance, preserves figures, and removes the legacy key", async () => {
    const db = new PGlite();
    try {
      await db.exec(
        "CREATE TABLE movies (id integer PRIMARY KEY, details jsonb NOT NULL)",
      );
      const details = [
        { title: "Mojo", budget: 20, boxOffice: figures },
        {
          title: "TMDB",
          budget: 20,
          boxOffice: { ...figures, budget: 20, budgetSource: "tmdb" },
        },
        {
          title: "Wikipedia",
          budget: 0,
          wikipediaUrl: "https://en.wikipedia.org/wiki/Film",
          boxOffice: { ...figures, budget: 30, budgetSource: "wikipedia" },
        },
        {
          title: "Manual",
          budget: 20,
          boxOffice: { ...figures, budget: 0, budgetSource: "manual" },
        },
        {
          title: "Only manual",
          boxOffice: { source: "manual", budget: 10, budgetSource: "manual" },
        },
        { title: "No figures", budget: 20, justWatch: { keep: true } },
        { title: "Null figures", budget: "bad", boxOffice: null },
        { title: "Invalid TMDB", budget: -20 },
        { title: "Fractional TMDB", budget: 20.5 },
        { title: "Unsafe TMDB", budget: Number.MAX_SAFE_INTEGER + 1 },
      ];
      for (const [index, detail] of details.entries()) {
        await db.query("INSERT INTO movies VALUES ($1, $2)", [
          index,
          JSON.stringify(detail),
        ]);
      }
      await db.exec(migration);
      const { rows } = await db.query<{
        id: number;
        details: Record<string, unknown>;
        box_office: BoxOfficeSources;
      }>("SELECT * FROM movies ORDER BY id");
      for (const [index, row] of rows.entries()) {
        const { boxOffice: _legacy, ...expected } = details[index] as Record<
          string,
          unknown
        >;
        expect(row.details).toEqual(expected);
      }
      expect(rows[0].box_office.boxofficemojo).toEqual(figures);
      expect(rows[1].box_office.boxofficemojo?.budget).toBeNull();
      expect(rows[1].box_office.tmdb).toEqual({ budget: 20 });
      expect(rows[2].box_office.wikipedia).toEqual({
        budget: 30,
        url: "https://en.wikipedia.org/wiki/Film",
      });
      expect(rows[3].box_office.manual).toEqual({ budget: 0 });
      expect(rows[4].box_office).toEqual({ manual: { budget: 10 } });
      expect(rows[5].box_office).toEqual({ tmdb: { budget: 20 } });
      expect(rows.slice(6).map((row) => row.box_office)).toEqual([
        {},
        {},
        {},
        {},
      ]);
      expect(
        rows.slice(0, 5).map((row) => resolveBoxOffice(row.box_office)?.budget),
      ).toEqual([100, 20, 30, 0, 10]);
      expect(resolveBoxOffice(rows[3].box_office)?.worldwideGross).toBe(500);
    } finally {
      await db.close();
    }
  });
});
