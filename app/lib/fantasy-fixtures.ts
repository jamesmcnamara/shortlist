import type { Nomination } from "@/src/db/schema";

const people = {
  maya: { id: "u-maya", name: "Maya Chen", username: "maya" },
  sam: { id: "u-sam", name: "Sam Ortiz", username: "sam" },
  jo: { id: "u-jo", name: "Jo Park", username: "jo" },
};

export type Owner = keyof typeof people;

type Figures = [budget: number, gross: number] | null;

export const nomination = (
  id: number,
  owner: Owner,
  title: string,
  releaseDate: string | null,
  figures: Figures,
  fetchedAt = "2026-10-16T00:00:00Z",
): Nomination => ({
  id,
  theatreId: "theatre",
  userId: people[owner].id,
  movieId: id,
  comment: null,
  completedAt: null,
  createdAt: new Date("2026-01-01"),
  movie: {
    id,
    tmdbId: id,
    createdAt: new Date("2026-01-01"),
    details: {
      title,
      release_date: releaseDate ?? "",
      posterUrl: null,
      ...(figures && {
        boxOffice: {
          source: "boxofficemojo",
          url: `https://www.boxofficemojo.com/title/tt${id}/`,
          fetchedAt,
          currency: "USD",
          budget: figures[0],
          domesticGross: null,
          internationalGross: null,
          worldwideGross: figures[1],
        },
      }),
    } as Nomination["movie"]["details"],
    ratings: { raw: {}, services: [] },
  },
  nomcoms: [],
  nominator: people[owner],
  seenBy: [],
});

const m = 1_000_000;

/** Maya ($460m) leads Sam ($150m) by $310m. Jo has nothing scored. */
export const league = [
  nomination(1, "maya", "Heat Wave", "2026-03-01", [100 * m, 600 * m]),
  nomination(2, "maya", "Cold Open", "2026-06-01", [80 * m, 30 * m]),
  nomination(3, "sam", "Slow Burn", "2026-04-01", [50 * m, 350 * m]),
  nomination(4, "sam", "Big Flop", "2026-05-01", [200 * m, 50 * m]),
  nomination(5, "sam", "No Numbers", "2026-02-01", null),
  nomination(6, "jo", "Next Winter", "2026-12-25", null),
  nomination(7, "maya", "Mystery Date", null, [10 * m, 20 * m]),
];
