import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

interface OscarEntry {
  category: string;
  major: boolean;
}

interface OscarDataset {
  movies: Record<string, { entries: OscarEntry[] }>;
}

const categoryRank = ({ category, major }: OscarEntry) => {
  if (category === "BEST PICTURE") return 0;
  if (category.startsWith("DIRECTING")) return 1;
  return major ? 2 : 3;
};

describe("generated Oscar data", () => {
  it("sorts Best Picture, directing, other majors, then remaining categories", async () => {
    const dataset = JSON.parse(
      await readFile("public/data/oscars.json", "utf8"),
    ) as OscarDataset;
    const entries = dataset.movies.tt0120338.entries;

    expect(entries[0].category).toBe("BEST PICTURE");
    expect(entries[1].category).toBe("DIRECTING");

    entries.slice(1).forEach((entry, index) => {
      const previous = entries[index];
      const previousRank = categoryRank(previous);
      const rank = categoryRank(entry);

      expect(rank).toBeGreaterThanOrEqual(previousRank);
      if (rank === previousRank) {
        expect(entry.category.localeCompare(previous.category)).toBeGreaterThanOrEqual(
          0,
        );
      }
    });
  });
});
