import { enrichBoxOffice } from "@/app/lib/enrich-box-office";
import { enrichTrivia } from "@/app/lib/enrich-trivia";
import { findMovieById } from "@/app/lib/movie-metadata";
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
    await Promise.all([enrichBoxOffice(movie.id), enrichTrivia(movie.id)]);
    const enriched = await findMovieById(movie.id);
    if (!enriched) {
      return Response.json(
        { error: "That movie is no longer available." },
        { status: 404 },
      );
    }
    return Response.json(enriched);
  } catch (error) {
    console.error("Unable to enrich movie.", error);
    return Response.json(
      { error: "Couldn't enrich this movie. Try again." },
      { status: 500 },
    );
  }
}
