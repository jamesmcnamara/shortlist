import { notFound } from "next/navigation";
import { findMovieById } from "@/app/lib/movie-metadata";
import { dbId } from "@/lib/validation";
import { MoviePage } from "./MoviePage";

export default async function MovieDetailPage({
  params,
}: {
  params: Promise<{ movieId: string }>;
}) {
  const { movieId } = await params;
  if (!/^[1-9]\d*$/.test(movieId)) notFound();
  const parsed = dbId("Invalid movie id.").safeParse(Number(movieId));
  if (!parsed.success) notFound();
  const movie = await findMovieById(parsed.data);
  if (!movie) notFound();
  return <MoviePage movie={movie} />;
}
