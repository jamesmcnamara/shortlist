import { afterEach, describe, expect, it, vi } from 'vitest';
import { setMovieProviderForTesting } from '@/app/lib/movie-metadata';
import { GET } from '@/app/api/tmdb/search/route';

const currentUserId = vi.hoisted(() => ({ value: 'user-1' }));
vi.mock('@/lib/auth/server', () => ({
  auth: {
    getSession: async () => ({
      data: currentUserId.value ? { user: { id: currentUserId.value } } : null
    })
  }
}));

afterEach(() => {
  currentUserId.value = 'user-1';
});

describe('TMDB search route', () => {
  it('uses the injected provider and passes the trimmed query', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        id: 123,
        title: 'A Movie',
        releaseDate: '2025-01-01',
        overview: 'A description',
        posterUrl: null,
        tmdbRating: 7.5
      }
    ]);
    setMovieProviderForTesting({
      hasCredentials: () => true,
      search,
      fetchMovieValues: vi.fn()
    });

    const response = await GET(
      new Request('http://test/api/tmdb/search?query=%20movie%20')
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      results: [
        {
          id: 123,
          title: 'A Movie',
          releaseDate: '2025-01-01',
          overview: 'A description',
          posterUrl: null,
          tmdbRating: 7.5
        }
      ]
    });
    expect(search).toHaveBeenCalledWith('movie');
  });

  it('returns a gateway error when the provider fails', async () => {
    setMovieProviderForTesting({
      hasCredentials: () => true,
      search: vi.fn().mockRejectedValue(new Error('upstream failed')),
      fetchMovieValues: vi.fn()
    });

    const response = await GET(
      new Request('http://test/api/tmdb/search?query=movie')
    );

    expect(response.status).toBe(502);
  });

  it('rejects unauthenticated requests before contacting the provider', async () => {
    currentUserId.value = '';
    const search = vi.fn();
    setMovieProviderForTesting({
      hasCredentials: () => true,
      search,
      fetchMovieValues: vi.fn()
    });

    const response = await GET(
      new Request('http://test/api/tmdb/search?query=movie')
    );

    expect(response.status).toBe(401);
    expect(search).not.toHaveBeenCalled();
  });
});
