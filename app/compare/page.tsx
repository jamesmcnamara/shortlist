import Link from "next/link";
import { redirect } from "next/navigation";
import { AppMenu } from "@/app/components/AppMenu";
import { getMovieProvider } from "@/app/lib/movie-metadata";
import { requireUserId } from "@/lib/auth/require-user";
import type { Movie } from "@/src/db/schema";
import { MovieCompare } from "./MovieCompare";
import { compareHref, parseTmdbIds } from "./metrics";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  searchParams: Promise<{ tmdb?: string | string[] }>;
}

async function loadMovies(tmdbIds: number[]): Promise<Movie[]> {
  const provider = getMovieProvider();
  if (tmdbIds.length === 0 || !provider.hasCredentials()) return [];

  const results = await Promise.allSettled(tmdbIds.map(provider.get));
  return results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const tmdbIds = parseTmdbIds((await searchParams).tmdb);

  const userId = await requireUserId();
  if (!userId) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(compareHref(tmdbIds))}`);
  }

  const initialMovies = await loadMovies(tmdbIds);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          Shortlist
        </Link>
        <AppMenu />
      </header>
      <MovieCompare initialMovies={initialMovies} />
    </main>
  );
}
