import { findMovieById } from "@/app/lib/movie-metadata";
import { refreshMovie } from "@/app/lib/refresh-movie";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { badRequest, dbIdParam } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ movieId: string }> },
) {
  if (!(await requireUserId())) return unauthorized();
  const parsed = dbIdParam("A movie id is required.").safeParse(
    (await params).movieId,
  );
  if (!parsed.success) return badRequest(parsed.error);
  try {
    const movie = await findMovieById(parsed.data);
    if (!movie) {
      return Response.json(
        { error: "That movie is no longer available." },
        { status: 404 },
      );
    }
    return Response.json(await refreshMovie(movie));
  } catch (error) {
    console.error("Unable to refresh movie.", error);
    return Response.json(
      { error: "Couldn't refresh this movie. Try again." },
      { status: 502 },
    );
  }
}
