import { MovieSearchResult } from "./MovieSearchResult";
import type { MovieSearchResultData } from "./MovieSearchResult";

type MovieSearchResultsProps = {
  results: MovieSearchResultData[];
  isLoading: boolean;
  error: string;
};

export function MovieSearchResults({ results, isLoading, error }: MovieSearchResultsProps) {
  if (isLoading) {
    return <p className="search-status" role="status">Searching TMDB...</p>;
  }

  if (error) {
    return <p className="search-status search-error" role="alert">{error}</p>;
  }

  if (results.length === 0) {
    return null;
  }

  return (
    <section className="search-results" aria-label="TMDB movie search results">
      <div className="search-results-heading">
        <h2>Matching movies</h2>
        <span>{results.length} result{results.length === 1 ? "" : "s"}</span>
      </div>
      <ul>
        {results.map((movie) => <MovieSearchResult key={movie.id} movie={movie} />)}
      </ul>
    </section>
  );
}
