export type MovieSearchResultData = {
  id: number;
  title: string;
  releaseDate: string;
  overview: string;
  posterUrl: string | null;
};

type MovieSearchResultProps = {
  movie: MovieSearchResultData;
};

export function MovieSearchResult({ movie }: MovieSearchResultProps) {
  const year = movie.releaseDate ? movie.releaseDate.slice(0, 4) : "Year unknown";

  return (
    <li className="search-result">
      {movie.posterUrl ? (
        <img src={movie.posterUrl} alt={`Poster for ${movie.title}`} />
      ) : (
        <div className="poster-placeholder" aria-label="No poster available">
          No poster
        </div>
      )}
      <div className="search-result-copy">
        <h3>{movie.title}</h3>
        <p>{year}</p>
        {movie.overview && <span>{movie.overview}</span>}
      </div>
    </li>
  );
}
