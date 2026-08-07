'use client';

import { SubmitEventHandler, useEffect, useState } from 'react';
import { some } from 'shades';
import { authClient } from '@/lib/auth/client';
import { getMonth } from '@/app/lib/date-utils';
import type { MovieSearchResultData } from './components/MovieSearchResult';
import { MovieCard, MovieDiscussion } from './components/MovieCard';
import { NominationPanel } from './components/NominationPanel';
import { ShortlistHeader } from './components/ShortlistHeader';
import type { Movie } from '@/src/db/schema';
import { EntityCache } from './lib/entity-cache';
import styles from './page.module.css';

export default function Home() {
  const { data: session } = authClient.useSession();
  const [cache, setCache] = useState(() => new EntityCache());
  const [query, setQuery] = useState('');
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [searchResults, setSearchResults] = useState<MovieSearchResultData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedMovie, setSelectedMovie] = useState<MovieSearchResultData | null>(null);
  const [isNominationOpen, setIsNominationOpen] = useState(false);
  const [expandedMovie, setExpandedMovie] = useState<number | null>(null);

  useEffect(() => {
    Promise.all(["movies", "nominations", "votes", "users"].map(async (entity) => {
      const response = await fetch(`/api/${entity}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data;
    })).then(([movies, nominations, votes, users]) => {
      const nextCache = new EntityCache({ movies, nominations, votes, users, nomcoms: [] });
      setCache(nextCache);
    }).catch((error: Error) => setMessage(error.message));
  }, []);

  const currentMonth = getMonth()

  useEffect(() => {
    if (!isNominationOpen || selectedMovie || query.length < 2) {
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
  }, [query, isNominationOpen, selectedMovie]);

  const activeMovies = cache.nominees()
  const userHasNominatedThisMonth = cache.hasUserNominatedThisMonth(session?.user?.id, currentMonth);
  const votesRemaining = cache.votesRemaining(session?.user?.id, currentMonth);

  function chooseSearchResult(movie: MovieSearchResultData) {
    setSelectedMovie(movie);
    setQuery('')
    setSearchResults([]);
  }

  const nominate: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (userHasNominatedThisMonth || !selectedMovie || isSubmitting) return;
    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/nominate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tmdbId: selectedMovie.id, comment })
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error);
        return;
      }
      setCache(cache.addNomination(data.movie, data.nomination));
      setComment('');
      setSelectedMovie(null);
      setIsNominationOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function markWatched(id: number) {
  }

  async function changeVote(movie: Movie, action: 'add' | 'remove') {
    const nom = cache.nominationsByMovie.get(movie.id);
    if (!nom) return;
    setMessage('');
    const response = await fetch('/api/votes', {
      method: action === 'add' ? 'POST' : 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nominationId: nom.id })
    });
    if (!response.ok) {
      const data = await response.json();
      setMessage(data.error);
      return;
    }
    if (action === 'add') {
      cache.addVote(await response.json());
    } else {
      cache.deleteVoteForUser(movie.id, session?.user?.id);
      const vote = Array.from(cache.votes.values())
        .filter((item) => item.userId === session?.user?.id && item.nominationId === nom.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      if (vote) cache.votes.delete(vote.id);
    }
  }

  return (
    <main className={styles.shell}>
      <ShortlistHeader votesRemaining={cache.votesRemaining(session?.user?.id, currentMonth)} />

      <section className={styles.toolbar}>
        <div>
          <h1>And the nominees are...</h1>
        </div>
        <div className={styles.toolbarActions}>
          <button className={styles.nominateButton} type="button" onClick={() => setIsNominationOpen((open) => !open)}>
            {userHasNominatedThisMonth ? "Rescind your nom" : '+ Choose your fighter'}
          </button>
        </div>
      </section>

      {isNominationOpen && (
        <NominationPanel
          nominatedThisMonth={userHasNominatedThisMonth}
          query={query}
          isSearching={isSearching}
          searchError={searchError}
          searchResults={searchResults}
          selectedMovie={selectedMovie}
          comment={comment}
          isSubmitting={isSubmitting}
          onClose={() => setIsNominationOpen(false)}
          onSubmit={nominate}
          onSelect={chooseSearchResult}
          onClearSelection={() => { setSelectedMovie(null); setQuery(''); setComment(''); }}
          onQueryChange={(value) => { setQuery(value); setSelectedMovie(null); }}
          onCommentChange={setComment}
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
                const votes = cache.votesForMovie(movie.id);
                const nomination = cache.nominationsByMovie.get(movie.id);
                const nominator = nomination ? cache.users.get(nomination.userId) : undefined;
                if (!nomination || !nominator) return null;
                return (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    votes={votes}
                    nominator={nominator}
                    rank={index + 1}
                    hasUpvoted={some({userId: session?.user?.id})(votes)}
                    canVote={!cache.isNominatedBy(movie.id, session?.user?.id) && votesRemaining > 0}
                    onAddVote={() => changeVote(movie, 'add').catch((error: Error) => setMessage(error.message))}
                    onToggleDiscussion={() => setExpandedMovie(expandedMovie === movie.id ? null : movie.id)}
                  />
                );
              })}
              {rowMovies.some((movie) => movie.id === expandedMovie) && (() => {
                const expanded = rowMovies.find((movie) => movie.id === expandedMovie);
                if (!expanded) return null;
                const votes = cache.votesForMovie(expanded.id);
                const nomination = cache.nominationsByMovie.get(expanded.id);
                const nominator = nomination ? cache.users.get(nomination.userId) : undefined;
                if (!nomination || !nominator) return null;
                return (
                  <MovieDiscussion
                    movie={expanded}
                    votes={votes}
                    nomination={nomination}
                    nominator={nominator}
                    nomcoms={[]}
                    hasUpvoted={some({userId: session?.user?.id})(votes)}
                    canVote={!cache.isNominatedBy(expanded.id, session?.user?.id) && votesRemaining > 0}
                    onAddVote={() => changeVote(expanded, 'add').catch((error: Error) => setMessage(error.message))}
                    onRemoveVote={() => changeVote(expanded, 'remove').catch((error: Error) => setMessage(error.message))}
                    onMarkWatched={() => markWatched(expanded.id)}
                  />
                );
              })()}
            </div>
          );
        })}
      </section>
    </main>
  );
}
