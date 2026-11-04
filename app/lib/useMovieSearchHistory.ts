import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Movie } from "@/src/db/schema";
import { set } from "shades";

const KEY = "__shortlistSearchMovieId";
const stateSchema = z.record(z.string(), z.unknown()).catch({});
const movieState = z.object({ [KEY]: z.number() });

export function useMovieSearchHistory() {
  const [selected, setSelected] = useState<Movie | null>(null);
  const movies = useRef(new Map<number, Movie>());

  useEffect(() => {
    const restore = (event: PopStateEvent) => {
      const id = movieState.safeParse(event.state).data?.[KEY];
      setSelected(id === undefined ? null : (movies.current.get(id) ?? null));
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const selectMovie = (movie: Movie) => {
    movies.current.set(movie.id, movie);
    // Keep Next's search-page tree so Back restores the mounted search and its results.
    window.history.pushState(
      set(KEY)(movie.id)(stateSchema.parse(window.history.state)),
      "",
      `/m/${movie.id}`,
    );
    setSelected(movie);
    window.scrollTo(0, 0);
  };

  return { selected, selectMovie, closeMovie: window.history.back };
}
