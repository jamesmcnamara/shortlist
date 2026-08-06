'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { MovieSearchResults } from './components/MovieSearchResults';
import type { MovieSearchResultData } from './components/MovieSearchResult';
import { MovieCard, MovieDiscussion } from './components/MovieCard';
import { NominationPanel } from './components/NominationPanel';
import { ShortlistHeader } from './components/ShortlistHeader';
import { WatchedArchive } from './components/WatchedArchive';
import type { Movie, MovieMeta } from './components/shortlist-types';
import styles from './page.module.css';

const people = [
  { name: 'James', initials: 'JM', color: 'violet' },
  { name: 'Maya', initials: 'MK', color: 'lilac' },
  { name: 'Theo', initials: 'TH', color: 'mint' },
  { name: 'Rae', initials: 'RA', color: 'gold' }
];

const recommendations = [
  'A perfect rainy-night pick.',
  'Trust me. This one has everything.',
  'The group chat will have thoughts.',
  'A weird little masterpiece.'
];

function readStoredIds(key: string) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) && value.every((item) => typeof item === 'number') ? value : [];
  } catch {
    return [];
  }
}

function getMeta(movie: Movie, index: number): MovieMeta {
  const person = people[index % people.length];
  return {
    ...person,
    nominator: person.name,
    recommendation: recommendations[index % recommendations.length],
    upvotes: people.slice(0, Math.max(1, (movie.id % people.length) + 1)).map((item) => item.name),
    comments: (movie.id % 4) + 1
  };
}

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [message, setMessage] = useState('');
  const [searchResults, setSearchResults] = useState<MovieSearchResultData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResultData | null>(null);
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [expandedMovie, setExpandedMovie] = useState<number | null>(null);
  const [watchedMovies, setWatchedMovies] = useState<number[]>([]);
  const [nominatedThisMonth, setNominatedThisMonth] = useState(false);
  const [upvotedMovies, setUpvotedMovies] = useState<number[]>([]);

  async function loadMovies() {
    const response = await fetch('/api/movies');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setMovies(data);
  }

  useEffect(() => {
    loadMovies().catch((error: Error) => setMessage(error.message));
    setWatchedMovies(readStoredIds('shortlist-watched'));
    setUpvotedMovies(readStoredIds('shortlist-upvotes'));
    setNominatedThisMonth(window.localStorage.getItem('shortlist-nominated-month') === new Date().toISOString().slice(0, 7));
  }, []);

  useEffect(() => {
    const query = title.trim();
    if (!isNominationOpen || query.length < 2) {
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
        const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSearchResults(data.results);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setSearchError(error instanceof Error ? error.message : 'Search failed.');
        setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [title, isNominationOpen]);

  const activeMovies = useMemo(
    () => movies
      .filter((movie) => !watchedMovies.includes(movie.id))
      .sort((a, b) => getMeta(b, movies.indexOf(b)).upvotes.length - getMeta(a, movies.indexOf(a)).upvotes.length),
    [movies, watchedMovies]
  );
  const watched = movies.filter((movie) => watchedMovies.includes(movie.id));

  function chooseSearchResult(movie: MovieSearchResultData) {
    setSelectedMovie(movie);
    setTitle(movie.title);
    setYear(movie.releaseDate ? movie.releaseDate.slice(0, 4) : '');
    setSearchResults([]);
  }

  async function addMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nominatedThisMonth) return;
    setMessage('');
    const response = await fetch('/api/movies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        year,
        tmdbId: selectedMovie?.id,
        posterUrl: selectedMovie?.posterUrl,
        description: selectedMovie?.overview
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error);
      return;
    }
    window.localStorage.setItem('shortlist-nominated-month', new Date().toISOString().slice(0, 7));
    setNominatedThisMonth(true);
    setTitle('');
    setYear('');
    setSelectedMovie(null);
    setIsNominationOpen(false);
    loadMovies().catch((error: Error) => setMessage(error.message));
  }

  function markWatched(id: number) {
    const next = [...watchedMovies, id];
    setWatchedMovies(next);
    window.localStorage.setItem('shortlist-watched', JSON.stringify(next));
  }

  function toggleUpvote(id: number) {
    const next = upvotedMovies.includes(id) ? upvotedMovies.filter((movieId) => movieId !== id) : [...upvotedMovies, id];
    setUpvotedMovies(next);
    window.localStorage.setItem('shortlist-upvotes', JSON.stringify(next));
  }

  return (
    <main className={styles.shell}>
      <ShortlistHeader />

      <section className={styles.toolbar}>
        <div>
          <h1>Current nominations</h1>
        </div>
        <div className={styles.toolbarActions}>
          <button className={styles.nominateButton} type="button" onClick={() => setIsNominationOpen((open) => !open)}>
            {nominatedThisMonth ? 'Tribute delivered' : '+ Volunteer as Tribute'}
          </button>
        </div>
      </section>

      {isNominationOpen && (
        <NominationPanel
          nominatedThisMonth={false}
          title={title}
          isSearching={isSearching}
          searchError={searchError}
          searchResults={searchResults}
          onClose={() => setIsNominationOpen(false)}
          onSubmit={addMovie}
          onSelect={chooseSearchResult}
          onTitleChange={(value) => { setTitle(value); setSelectedMovie(null); }}
        />
      )}

      {message && <div className={styles.message} role="status">{message}</div>}
      <section className={styles.movieList} aria-label="Current movie nominations">
        {activeMovies.length === 0 ? (
          <div className={styles.emptyState}><span>✦</span><h2>Nothing in the arena yet.</h2><p>Be the first to volunteer a movie for the group.</p></div>
        ) : Array.from({ length: Math.ceil(activeMovies.length / 3) }, (_, rowIndex) => {
          const rowMovies = activeMovies.slice(rowIndex * 3, rowIndex * 3 + 3);
          return (
            <div className={styles.movieRow} key={`row-${rowIndex}`}>
              {rowMovies.map((movie, columnIndex) => {
                const index = rowIndex * 3 + columnIndex;
                return (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    meta={getMeta(movie, movies.indexOf(movie))}
                    rank={index + 1}
                    hasUpvoted={upvotedMovies.includes(movie.id)}
                    onToggleUpvote={() => toggleUpvote(movie.id)}
                    onToggleDiscussion={() => setExpandedMovie(expandedMovie === movie.id ? null : movie.id)}
                  />
                );
              })}
              {rowMovies.some((movie) => movie.id === expandedMovie) && (() => {
                const expanded = rowMovies.find((movie) => movie.id === expandedMovie);
                if (!expanded) return null;
                return (
                  <MovieDiscussion
                    movie={expanded}
                    meta={getMeta(expanded, movies.indexOf(expanded))}
                    hasUpvoted={upvotedMovies.includes(expanded.id)}
                    onMarkWatched={() => markWatched(expanded.id)}
                  />
                );
              })()}
            </div>
          );
        })}
      </section>

      <WatchedArchive movies={watched} />
    </main>
  );
}
