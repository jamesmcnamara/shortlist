import { and, eq, exists, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import {
  type BoxOfficeSources,
  getBoxOffice,
  imdbId,
  resolveBoxOffice,
  validTmdbBudget,
} from "./box-office";
import { getWikipediaBudget } from "./wikipedia-budget";

const detailsIds = z.object({ imdb_id: z.unknown().optional() });
const ratingsIds = z.object({
  raw: z.object({ ids: z.object({ imdb: z.unknown().optional() }) }),
});
const tmdbBudget = z.object({
  budget: validTmdbBudget,
});
const wikipediaDetails = z.object({ wikipediaUrl: z.string() });

function movieCondition(movieId: number, theatreId?: string) {
  const db = getDb();
  return and(
    eq(movies.id, movieId),
    theatreId === undefined
      ? undefined
      : exists(
          db
            .select({ id: nominations.id })
            .from(nominations)
            .where(
              and(
                eq(nominations.movieId, movies.id),
                eq(nominations.theatreId, theatreId),
              ),
            ),
        ),
  );
}

const mergeSources = (sources: BoxOfficeSources) =>
  sql`${movies.boxOffice} || ${JSON.stringify(sources)}::jsonb`;

export async function saveManualBudget(
  movieId: number,
  theatreId: string,
  budget: number,
) {
  const [updated] = await getDb()
    .update(movies)
    .set({ boxOffice: mergeSources({ manual: { budget } }) })
    .where(movieCondition(movieId, theatreId))
    .returning({ id: movies.id });
  return { status: updated ? "updated" : "not_found" } as const;
}

export async function refreshBoxOffice(movieId: number, theatreId?: string) {
  const db = getDb();
  const condition = movieCondition(movieId, theatreId);
  const [movie] = await db
    .select({ details: movies.details, ratings: movies.ratings })
    .from(movies)
    .where(condition)
    .limit(1);
  if (!movie) return { status: "not_found" } as const;

  const id = [
    detailsIds.safeParse(movie.details).data?.imdb_id,
    ratingsIds.safeParse(movie.ratings).data?.raw.ids.imdb,
  ]
    .map((value) => imdbId.safeParse(value).data)
    .find((value) => value !== undefined);
  if (!id) return { status: "missing_imdb" } as const;

  const mojo = await getBoxOffice(id);
  const tmdb = tmdbBudget.safeParse(movie.details).data?.budget ?? null;
  const wikipediaUrl = wikipediaDetails.safeParse(movie.details).data
    ?.wikipediaUrl;
  const sources: BoxOfficeSources = {
    boxofficemojo: mojo,
    tmdb: { budget: tmdb },
    wikipedia: { url: wikipediaUrl ?? null, budget: null },
  };
  if (mojo.budget === null && tmdb === null && wikipediaUrl) {
    try {
      sources.wikipedia = {
        url: wikipediaUrl,
        budget: await getWikipediaBudget(wikipediaUrl),
      };
    } catch (error) {
      console.error(`Unable to load a budget from ${wikipediaUrl}.`, error);
    }
  }

  const [updated] = await db
    .update(movies)
    .set({ boxOffice: mergeSources(sources) })
    .where(condition)
    .returning({ boxOffice: movies.boxOffice });
  return updated
    ? ({
        status: "updated",
        boxOffice: resolveBoxOffice(updated.boxOffice),
      } as const)
    : ({ status: "not_found" } as const);
}

export async function enrichBoxOffice(movieId: number): Promise<void> {
  try {
    const result = await refreshBoxOffice(movieId);
    if (result.status !== "updated") {
      console.warn(
        `Skipping Box Office Mojo for movie ${movieId}: ${result.status}.`,
      );
    }
  } catch (error) {
    console.error(
      `Unable to load Box Office Mojo for movie ${movieId}.`,
      error,
    );
  }
}
