import { NextResponse } from "next/server";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getMovieProvider } from "@/app/lib/movie-metadata";

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const query = new URL(request.url).searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const provider = getMovieProvider();
  if (!provider.hasCredentials()) {
    return NextResponse.json(
      { error: "TMDB credentials are not configured." },
      { status: 500 },
    );
  }

  try {
    return NextResponse.json({ results: await provider.search(query) });
  } catch {
    return NextResponse.json(
      { error: "Unable to search TMDB right now." },
      { status: 502 },
    );
  }
}
