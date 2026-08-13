import { find } from "shades";
import { getMonth } from "@/app/lib/utils";
import { withUser } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import { TMDB } from "@lorenzopant/tmdb";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const tmdb = new TMDB(
  process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "",
  {
    language: "en-US",
  },
);

export const GET = withUser({ error: "Unable to load nominations" })(
  async () => {
    return Response.json(
      await getDb().query.nominations.findMany({
        with: {
          movie: true,
          votes: {
            with: { voter: true },
          },
          nomcoms: {
            with: { commenter: true },
            orderBy: (nomcoms, { asc }) => asc(nomcoms.createdAt),
          },
          nominator: true,
        },
        orderBy: (n, { desc }) => desc(n.createdAt),
      }),
    );
  },
);

export const POST = withUser({ error: "Unable to create nomination." })(async (
  request: Request,
  userId: string,
) => {
  const body = await request.json().catch(() => null);
  const tmdbId = Number(body?.tmdbId);
  if (!Number.isInteger(tmdbId)) {
    return Response.json(
      { error: "A TMDB movie id is required." },
      { status: 400 },
    );
  }
  const comment =
    typeof body?.comment === "string" && body.comment.trim()
      ? body.comment.trim()
      : null;

  if (!process.env.TMDB_API_READ_ACCESS_TOKEN && !process.env.TMDB_API_KEY) {
    return Response.json(
      { error: "TMDB credentials are not configured." },
      { status: 500 },
    );
  }

  const month = getMonth();
  const db = getDb();

  if (process.env.ALLOW_MULTIPLE_NOMINATIONS !== "true") {
    try {
      const existing = await db
        .select()
        .from(nominations)
        .where(
          and(eq(nominations.userId, userId), eq(nominations.month, month)),
        )
        .limit(1);
      if (existing.length > 0) {
        return Response.json(
          { error: "You can nominate one movie per month." },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: "Unable to create the nomination." },
        { status: 500 },
      );
    }
  }

  let details;
  try {
    details = await tmdb.movies.details({ movie_id: tmdbId });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to load that movie from TMDB right now." },
      { status: 502 },
    );
  }

  let mdbRatings;
  try {
    mdbRatings = await getMdbRatings(tmdbId);
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to load ratings from MDBList right now." },
      { status: 502 },
    );
  }

  const values = {
    tmdbId: details.id,
    title: details.title,
    posterUrl: details.poster_path
      ? tmdb.images.poster(details.poster_path, "w342")
      : null,
    description: details.overview ?? null,
    year: details.release_date
      ? Number(details.release_date.slice(0, 4)) || null
      : null,
    runtime: details.runtime ?? null,
    tmdbRating: details.vote_average || null,
    imdbRating: mdbRatings.imdb.value,
    imdbUrl: mdbRatings.imdb.url,
    letterboxdRating: mdbRatings.letterboxd.value,
    letterboxdUrl: mdbRatings.letterboxd.url,
    rottenTomatoesRating: mdbRatings.tomatoes.value,
    rottenTomatoesUrl: mdbRatings.tomatoes.url,
    rottenTomatoesAudienceRating: mdbRatings.popcorn.value,
    rottenTomatoesAudienceUrl: mdbRatings.popcorn.url,
  };

  const [movie] = await db
    .insert(movies)
    .values(values)
    .onConflictDoUpdate({ target: movies.tmdbId, set: values })
    .returning();

  const existingNomination = await db
    .select({ id: nominations.id })
    .from(nominations)
    .where(eq(nominations.movieId, movie.id))
    .limit(1);
  if (existingNomination.length > 0) {
    return Response.json(
      { error: "That movie has already been nominated." },
      { status: 409 },
    );
  }

  const [nomination] = await db
    .insert(nominations)
    .values({
      userId,
      month,
      movieId: movie.id,
      comment,
    })
    .returning();

  return Response.json(await getFullNominationForId(nomination.id), {
    status: 201,
  });
});

export const DELETE = withUser({ error: "Unable to delete the nomination." })(
  async (request: Request, userId: string) => {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) {
      return Response.json(
        { error: "A nomination id is required." },
        { status: 400 },
      );
    }

    const deleted = await getDb()
      .delete(nominations)
      .where(and(eq(nominations.id, id), eq(nominations.userId, userId)))
      .returning({ id: nominations.id });
    if (deleted.length === 0)
      return Response.json(
        { error: "That nomination no longer exists." },
        { status: 404 },
      );
    return new Response(null, { status: 204 });
  },
);

interface MDBResponse {
  ratings: MDBRating[];
  ids: {
    imdb?: string;
  };
}

interface MDBRating {
  source: RatingSource;
  value: number | null;
  url: string | null;
}

type RatingSource = "imdb" | "letterboxd" | "tomatoes" | "popcorn";

interface Rating {
  value: number | null;
  url: string | null;
}

type MdbRatings = Record<RatingSource, Rating>;

async function getMdbRatings(tmdbId: number): Promise<MdbRatings> {
  const apiKey = process.env.MDB_API_KEY;
  if (!apiKey) throw new Error("MDB API credentials are not configured.");

  const response = await fetch(
    `https://api.mdblist.com/tmdb/movie/${tmdbId}?apikey=${encodeURIComponent(apiKey)}`,
  );
  if (!response.ok) {
    throw new Error(`MDBList returned ${response.status}.`);
  }

  const data: MDBResponse = await response.json();

  const ratings = data.ratings;
  const imdbId = data.ids.imdb;

  return {
    imdb: {
      value: getRatingValue(ratings, "imdb"),
      url:
        imdbId && /^tt\d+$/.test(imdbId)
          ? `https://www.imdb.com/title/${imdbId}/`
          : null,
    },
    letterboxd: {
      value: getRatingValue(ratings, "letterboxd"),
      url: getProviderUrl(
        "https://letterboxd.com",
        getRatingUrl(ratings, "letterboxd"),
      ),
    },
    tomatoes: {
      value: getRatingValue(ratings, "tomatoes"),
      url: getProviderUrl(
        "https://www.rottentomatoes.com",
        getRatingUrl(ratings, "tomatoes"),
      ),
    },
    popcorn: {
      value: getRatingValue(ratings, "popcorn"),
      url: getProviderUrl(
        "https://www.rottentomatoes.com",
        getRatingUrl(ratings, "popcorn"),
      ),
    },
  };
}

function getRatingValue(
  ratings: MDBRating[],
  source: RatingSource,
): number | null {
  return find({ source })(ratings)?.value ?? null;
}

function getRatingUrl(
  ratings: MDBRating[],
  source: RatingSource,
): string | null {
  return ratings.find((rating) => rating.source === source)?.url ?? null;
}

function getProviderUrl(baseUrl: string, path: string | null): string | null {
  return path?.startsWith("/") ? `${baseUrl}${path}` : null;
}

export function getFullNominationForId(nominationId: number) {
  return getDb().query.nominations.findFirst({
    where: (n, { eq }) => eq(n.id, nominationId),
    with: {
      movie: true,
      votes: {
        with: { voter: true },
      },
      nomcoms: {
        with: { commenter: true },
        orderBy: (nomcoms, { asc }) => asc(nomcoms.createdAt),
      },
      nominator: true,
    },
  });
}
