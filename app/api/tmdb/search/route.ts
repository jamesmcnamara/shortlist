import { TMDB } from "@lorenzopant/tmdb";
import { NextResponse } from "next/server";

const tmdb = new TMDB(process.env.TMDB_API_READ_ACCESS_TOKEN ?? process.env.TMDB_API_KEY ?? "", {
  language: "en-US"
});

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  if (!process.env.TMDB_API_READ_ACCESS_TOKEN && !process.env.TMDB_API_KEY) {
    return NextResponse.json({ error: "TMDB credentials are not configured." }, { status: 500 });
  }

  try {
    const response = await tmdb.search.movies({ query, include_adult: false });

    return NextResponse.json({
      results: response.results.slice(0, 5).map((movie) => ({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.release_date,
        overview: movie.overview,
        posterUrl: movie.poster_path ? tmdb.images.poster(movie.poster_path, "w342") : null
      }))
    });
  } catch {
    return NextResponse.json({ error: "Unable to search TMDB right now." }, { status: 502 });
  }
}
