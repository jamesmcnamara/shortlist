'use client';

import type { MovieSearchResultData } from './components/MovieSearchResult';
import { MovieSearchResults } from './components/MovieSearchResults';
import { FormEvent, useEffect, useState } from 'react';

type Movie = {
  id: number;
  title: string;
  year: number | null;
};

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [message, setMessage] = useState('');
  const [searchResults, setSearchResults] = useState<MovieSearchResultData[]>(
    []
  );
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  async function loadMovies() {
    const response = await fetch('/api/movies');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setMovies(data);
  }

  useEffect(() => {
    loadMovies().catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    const query = title.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchError('');
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError('');

      try {
        const response = await fetch(
          `/api/tmdb/search?query=${encodeURIComponent(query)}`,
          {
            signal: controller.signal
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSearchResults(data.results);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        setSearchError(
          error instanceof Error ? error.message : 'Search failed.'
        );
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [title]);

  async function addMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    const response = await fetch('/api/movies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, year })
    });
    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error);
      return;
    }

    setTitle('');
    setYear('');
    loadMovies().catch((error: Error) => setMessage(error.message));
  }

  async function removeMovie(id: number) {
    const response = await fetch(`/api/movies?id=${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error);
      return;
    }

    loadMovies().catch((error: Error) => setMessage(error.message));
  }

  return (
    <main>
      <h1>Shortlist</h1>
      <p>Keep track of what to watch next.</p>
      <form onSubmit={addMovie}>
        <input
          aria-label="Movie title"
          type="text"
          placeholder="Movie title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
        <button>Add</button>
      </form>
      <MovieSearchResults
        results={searchResults}
        isLoading={isSearching}
        error={searchError}
      />
      <div id="message" role="status">
        {message}
      </div>
      <ul>
        {movies.map((movie) => (
          <li key={movie.id}>
            <span>
              {movie.title}
              {movie.year ? ` (${movie.year})` : ''}
            </span>
            <button
              type="button"
              aria-label={`Remove ${movie.title}`}
              onClick={() => removeMovie(movie.id)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
