import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface OscarEntry {
  id: number;
  year: string;
  category: string;
  major: boolean;
  name: string;
  winner: boolean;
}

interface OscarNominee {
  id: number;
  film?: string;
  name: string;
  winner: boolean;
}

interface OscarDataset {
  movies: Record<string, { entries: OscarEntry[] }>;
  nominees: Record<string, OscarNominee[]>;
}

const loadDataset = readFile("public/data/oscars.json", "utf8").then(
  (text) => JSON.parse(text) as OscarDataset,
);

const NON_COMPETITIVE = /HONORARY|SPECIAL|SCIENTIFIC|COMMENDATION/;

const categoryRank = ({ category, major }: OscarEntry) => {
  if (category === "BEST PICTURE") return 0;
  if (category.startsWith("DIRECTING")) return 1;
  return major ? 2 : 3;
};

describe("generated Oscar data", () => {
  it("sorts Best Picture, directing, other majors, then remaining categories", async () => {
    const dataset = await loadDataset;
    const entries = dataset.movies.tt0120338.entries;

    expect(entries[0].category).toBe("BEST PICTURE");
    expect(entries[1].category).toBe("DIRECTING");

    entries.slice(1).forEach((entry, index) => {
      const previous = entries[index];
      const previousRank = categoryRank(previous);
      const rank = categoryRank(entry);

      expect(rank).toBeGreaterThanOrEqual(previousRank);
      if (rank === previousRank) {
        expect(
          entry.category.localeCompare(previous.category),
        ).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it("lists each competitive nomination once among its award's nominees", async () => {
    const { movies, nominees } = await loadDataset;

    const unmatched = Object.values(movies)
      .flatMap(({ entries }) => entries)
      .filter((entry) => {
        const award = nominees[`${entry.year}|${entry.category}`];
        if (!award) return !NON_COMPETITIVE.test(entry.category);
        const matches = award.filter(({ id }) => id === entry.id);
        return (
          matches.length !== 1 ||
          matches[0].name !== entry.name ||
          matches[0].winner !== entry.winner
        );
      });

    expect(unmatched).toEqual([]);
  });

  it("orders every award's nominees winners first with unique ids and names", async () => {
    const { nominees } = await loadDataset;

    const invalid = Object.entries(nominees).filter(
      ([award, list]) =>
        NON_COMPETITIVE.test(award) ||
        new Set(list.map(({ id }) => id)).size !== list.length ||
        list.some(({ film, name }) => !film && !name) ||
        list.some(
          ({ winner }, index) => winner && index > 0 && !list[index - 1].winner,
        ),
    );

    expect(invalid.map(([award]) => award)).toEqual([]);
  });

  it("keeps nominees without films and repeat nominations from one film", async () => {
    const { nominees } = await loadDataset;

    expect(
      nominees["1927/28|WRITING (Title Writing)"].filter(({ film }) => !film),
    ).toHaveLength(2);
    expect(
      nominees["1950|ACTRESS IN A LEADING ROLE"].filter(
        ({ film }) => film === "All about Eve",
      ),
    ).toHaveLength(2);
  });
});
