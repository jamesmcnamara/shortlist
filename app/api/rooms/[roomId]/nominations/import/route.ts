import { getMovieProvider } from "@/app/lib/movie-metadata";
import type { MovieImportResult } from "@/app/lib/bulk-movie-import";
import { z } from "zod";
import { withRoomMember } from "@/lib/auth/require-room";
import { badRequest, parseJson, requiredText } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { nominations, type Movie } from "@/src/db/schema";

export const runtime = "nodejs";

const ONE_TITLE = "Enter one movie title, up to 300 characters.";

const importBody = z.object({
  title: requiredText(ONE_TITLE)
    .max(300, ONE_TITLE)
    .regex(/^[^\r\n]*$/, ONE_TITLE),
});

export const POST = withRoomMember({ error: "Unable to import this movie." })(
  async (request, { room, userId }) => {
    const parsed = await parseJson(request, importBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { title } = parsed.data;

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
