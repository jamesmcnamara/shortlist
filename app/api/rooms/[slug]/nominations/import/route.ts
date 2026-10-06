import { getMovieProvider } from "@/app/lib/movie-metadata";
import type { MovieImportResult } from "@/app/lib/bulk-movie-import";
import { withRoomMember } from "@/lib/auth/require-room";
import { getDb } from "@/src/db/client";
import { nominations, type Movie } from "@/src/db/schema";

export const runtime = "nodejs";

export const POST = withRoomMember({ error: "Unable to import this movie." })(
  async (request, { room, userId }) => {
    const body: unknown = await request.json().catch(() => null);
    const title =
      body &&
      typeof body === "object" &&
      "title" in body &&
      typeof body.title === "string"
        ? body.title.trim()
        : "";

    if (!title || title.length > 300 || /[\r\n]/.test(title)) {
      return Response.json(
        { error: "Enter one movie title, up to 300 characters." },
        { status: 400 },
      );
    }

    const provider = getMovieProvider();
    if (!provider.hasCredentials()) {
      return Response.json(
        { error: "Movie metadata credentials are not configured." },
        { status: 503 },
      );
    }

    let movie: Movie | null;
    try {
      movie = await provider.bestMatch(title);
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: "Unable to look up this movie right now. Try again." },
        { status: 502 },
      );
    }
    if (!movie) {
      return Response.json({ status: "not_found" } satisfies MovieImportResult);
    }

    const [inserted] = await getDb()
      .insert(nominations)
      .values({ roomId: room.id, userId, movieId: movie.id })
      .onConflictDoNothing({
        target: [nominations.roomId, nominations.movieId],
      })
      .returning({ id: nominations.id });

    return Response.json({
      status: inserted ? "added" : "already_on_list",
      movie: {
        id: movie.id,
        title: movie.details.title,
        year: movie.details.year ?? null,
      },
    } satisfies MovieImportResult);
  },
);
