import { mkdir, writeFile } from "node:fs/promises";

const SOURCE =
  "https://raw.githubusercontent.com/DLu/oscar_data/main/oscars.csv";
const OUTPUT = new URL("../public/data/oscars.json", import.meta.url);
const ACTING_CATEGORIES = new Set([
  "ACTOR IN A LEADING ROLE",
  "ACTOR IN A SUPPORTING ROLE",
  "ACTRESS IN A LEADING ROLE",
  "ACTRESS IN A SUPPORTING ROLE",
]);
const SCREENPLAY_CATEGORIES = new Set([
  "WRITING (Adapted Screenplay)",
  "WRITING (Original Screenplay)",
]);

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Oscar dataset returned ${response.status}.`);
}

const [header, ...lines] = (await response.text()).trim().split(/\r?\n/);
const columns = header.split("\t");
const index = Object.fromEntries(
  columns.map((column, position) => [column, position]),
);
const movies = new Map();

for (const line of lines) {
  const values = line.split("\t");
  const filmIds = values[index.FilmId]?.split("|") ?? [];
  const details = values[index.Detail]?.split("|") ?? [];

  filmIds.forEach((imdbId, position) => {
    if (!/^tt\d+$/.test(imdbId)) return;

    const entry = {
      year: values[index.Year],
      category: values[index.CanonicalCategory],
      winner: values[index.Winner] === "True",
      major: isMajorCategory(values[index.CanonicalCategory]),
      name: values[index.Name],
      ...(details[position] ? { detail: details[position] } : {}),
    };
    movies.set(imdbId, [...(movies.get(imdbId) ?? []), entry]);
  });
}

const output = {
  source: "https://github.com/DLu/oscar_data",
  license: "BSD-2-Clause",
  updatedThrough: Math.max(
    ...[...movies.values()].flatMap((entries) =>
      entries.map(({ year }) => Number(year.slice(0, 4)) || 0),
    ),
  ),
  movies: Object.fromEntries(
    [...movies.entries()].map(([imdbId, entries]) => {
      const unique = [
        ...new Map(
          entries.map((entry) => [JSON.stringify(entry), entry]),
        ).values(),
      ].sort(
        (left, right) =>
          categoryRank(left.category) - categoryRank(right.category) ||
          left.category.localeCompare(right.category) ||
          right.year.localeCompare(left.year) ||
          Number(right.winner) - Number(left.winner),
      );

      return [
        imdbId,
        {
          wins: unique.filter(({ winner }) => winner).length,
          nominations: unique.length,
          entries: unique,
        },
      ];
    }),
  ),
};

await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(output));

console.log(
  `Wrote ${Object.keys(output.movies).length} Oscar movie records through ${output.updatedThrough}.`,
);

function isMajorCategory(category) {
  return (
    category === "BEST PICTURE" ||
    category.startsWith("DIRECTING") ||
    ACTING_CATEGORIES.has(category) ||
    SCREENPLAY_CATEGORIES.has(category) ||
    category.startsWith("CINEMATOGRAPHY")
  );
}

function categoryRank(category) {
  if (category === "BEST PICTURE") return 0;
  if (category.startsWith("DIRECTING")) return 1;
  if (category.startsWith("WRITING")) return 2;
  return isMajorCategory(category) ? 3 : 4;
}
