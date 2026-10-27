import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import { getMovieProvider } from "@/app/lib/movie-metadata";
import type { Movie } from "@/src/db/schema";
import { Compare } from "./Compare";
import { parseTmdbIds } from "./metrics";
import styles from "./page.module.css";
import { requireUserId } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<{ tmdb?: string | string[] }>;
}

async function loadMovies(tmdbIds: number[]): Promise<Movie[]> {
  const provider = getMovieProvider();
  if (tmdbIds.length === 0 || !provider.hasCredentials()) return [];

  const results = await Promise.allSettled(tmdbIds.map(provider.get));
  return results.flatMap((result) => {
    if (result.status === "fulfilled") return [result.value];
    console.error(result.reason);
    return [];
  });
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const tmdbIds = parseTmdbIds((await searchParams).tmdb);
  const userId = await requireUserId();

  const initialMovies = await loadMovies(tmdbIds);

  return (
    <main className={styles.shell}>
      <ShortlistHeader />
      <Compare initialMovies={initialMovies} userId={userId} />
    </main>
  );
}
