import { get } from "shades";
import { z } from "zod";
import type {
  Feedback,
  FeedbackCategory,
  Nomination,
  TheatreRole,
  User,
} from "@/src/db/schema";
import type { SafeTheatre } from "@/lib/auth/require-theatre";
import type {
  NotificationChanges,
  NotificationSettings,
} from "@/lib/notifications/settings";
import type { Movie } from "@/src/db/schema";
import type { MovieImportResult } from "./bulk-movie-import";
import type { JustWatchAvailability } from "./justwatch-types";
import type { BoxOfficeData } from "./box-office";
import type { MovieRefreshResult } from "./refresh-movie";

export const errorResponse = z.object({ error: z.string() });

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type MutationUpdate =
  | { kind: "nomination"; nomination: Nomination }
  | { kind: "movie"; movie: Movie };

type MutationListener = (
  path: string,
  method: string,
  update?: MutationUpdate,
) => Promise<void>;
const mutationListeners = new Set<MutationListener>();

export function subscribeToMutations(listener: MutationListener) {
  let active = true;
  const subscription: MutationListener = async (path, method, update) => {
    if (active) await listener(path, method, update);
  };
  mutationListeners.add(subscription);
  return () => {
    active = false;
    mutationListeners.delete(subscription);
  };
}

async function request<T>(
  path: string,
  init?: RequestInit,
  getUpdate?: (data: T) => MutationUpdate | undefined,
): Promise<T> {
  const method = init?.method ?? "GET";
  // Capture the current session's listeners before a request can outlive logout.
  const listeners = method === "GET" ? [] : [...mutationListeners];
  const response = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });

  const data =
    response.status === 204
      ? undefined
      : await response.json().catch(() => {
          throw new ApiError(
            "The server returned an invalid response.",
            response.status,
          );
        });
  if (!response.ok) {
    if ([401, 403, 404].includes(response.status)) {
      await Promise.all(listeners.map((listener) => listener(path, method)));
    }
    throw new ApiError(
      errorResponse.safeParse(data).data?.error ?? "Request failed.",
      response.status,
    );
  }
  const result = data as T;
  const update = data === undefined ? undefined : getUpdate?.(result);
  await Promise.all(
    listeners.map((listener) => listener(path, method, update)),
  );
  return result;
}

const pendingMovieEnrichments = new Set<number>();

function enrichMovieAfterNomination(movieId: number) {
  if (pendingMovieEnrichments.has(movieId)) return;

  pendingMovieEnrichments.add(movieId);
  void request<Movie>(
    `/api/movies/${movieId}/enrich`,
    { method: "POST" },
    (movie) => ({ kind: "movie", movie }),
  )
    .catch((error: unknown) => {
      console.error("Unable to enrich movie after nomination.", error);
    })
    .finally(() => pendingMovieEnrichments.delete(movieId));
}

export interface TheatreSummary {
  id: string;
  name: string;
  watchlistFor: string | null;
  role: TheatreRole | null;
  path: string;
}

export interface TheatreSummaryWithPosterPreviews extends TheatreSummary {
  posterUrls: string[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

/** As `TheatreSummary`, listing which of the `?movieIds=` it already has. */
export interface TheatreSummaryWithMovies extends TheatreSummary {
  movieIds: number[];
}

export interface TheatreMemberSummary extends User {
  role: TheatreRole;
  joinedAt: string;
}

export interface TheatreDetail {
  theatre: SafeTheatre;
  tags: string[];
  inviteCode?: string;
  adminInviteCode?: string;
  membership: { userId: string; role: TheatreRole } | null;
  members?: TheatreMemberSummary[];
}

/** What anyone with an invite link can see: read-only, and no member details. */
export interface PublicTheatre {
  theatre: Pick<SafeTheatre, "name" | "description" | "defaultSort">;
  nominations: Nomination[];
}

/**
 * Theatre-scoped calls bind the theatre ID once rather than threading it through
 * every call site.
 */
export const api = {
  movies: {
    refresh: (
      movieId: number,
      signal?: AbortSignal,
    ): Promise<MovieRefreshResult> =>
      request(`/api/movies/${movieId}/refresh`, { method: "POST", signal }),
  },
  push: {
    subscribe: (subscription: PushSubscriptionJSON): Promise<void> =>
      request("/api/push", {
        method: "POST",
        body: JSON.stringify(subscription),
      }),
    disconnect: (endpoint: string): Promise<void> =>
      request("/api/push", {
        method: "DELETE",
        body: JSON.stringify({ endpoint }),
      }),
  },
  theatres: {
    listWithPosters: (): Promise<TheatreSummaryWithPosterPreviews[]> =>
      request("/api/theatres?previews=true"),
    listForMovies: (movieIds: number[]): Promise<TheatreSummaryWithMovies[]> =>
      request(`/api/theatres?movieIds=${movieIds.join(",")}`),
    create: (input: { name: string }): Promise<SafeTheatre> =>
      request("/api/theatres", { method: "POST", body: JSON.stringify(input) }),
  },
  join: (code: string): Promise<{ path: string; name: string }> =>
    request(`/api/join/${encodeURIComponent(code)}`, { method: "POST" }),
  feedback: {
    create: (input: {
      message: string;
      category?: FeedbackCategory;
    }): Promise<Feedback> =>
      request("/api/feedback", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  theatre: (theatreId: string) => {
    const base = `/api/theatres/${encodeURIComponent(theatreId)}`;
    return {
      notifications: {
        get: (): Promise<NotificationSettings> =>
          request(`${base}/notifications`),
        set: (enabled: boolean): Promise<NotificationSettings> =>
          request(`${base}/notifications`, {
            method: "PUT",
            body: JSON.stringify({ enabled }),
          }),
        choose: (changes: NotificationChanges): Promise<NotificationSettings> =>
          request(`${base}/notifications`, {
            method: "PATCH",
            body: JSON.stringify(changes),
          }),
      },
      get: (): Promise<TheatreDetail> => request(base),
      refreshJustWatch: (movieId: number): Promise<JustWatchAvailability> =>
        request(`${base}/justwatch`, {
          method: "POST",
          body: JSON.stringify({ movieId }),
        }),
      saveBudget: (movieId: number, budget: number): Promise<void> =>
        request(`${base}/box-office`, {
          method: "PATCH",
          body: JSON.stringify({ movieId, budget }),
        }),
      refreshBoxOffice: (
        movieId: number,
        signal?: AbortSignal,
      ): Promise<BoxOfficeData> =>
        request(`${base}/box-office`, {
          method: "POST",
          body: JSON.stringify({ movieId }),
          signal,
        }),
      refreshWikipedia: (
        movieId: number,
        signal?: AbortSignal,
      ): Promise<{ wikipediaUrl: string | null }> =>
        request(`${base}/wikipedia`, {
          method: "POST",
          body: JSON.stringify({ movieId }),
          signal,
        }),
      update: (input: {
        name?: string;
        description?: string;
        defaultSort?: string | null;
      }): Promise<SafeTheatre> =>
        request(base, { method: "PATCH", body: JSON.stringify(input) }),
      delete: (): Promise<void> => request(base, { method: "DELETE" }),
      rotateInvite: (
        kind: "member" | "admin" = "member",
      ): Promise<{
        inviteCode?: string;
        adminInviteCode?: string;
      }> =>
        request(`${base}/invite/rotate`, {
          method: "POST",
          body: JSON.stringify({ kind }),
        }),
      members: {
        remove: (userId: string): Promise<void> =>
          request(`${base}/members/${encodeURIComponent(userId)}`, {
            method: "DELETE",
          }),
        setRole: (userId: string, role: TheatreRole): Promise<void> =>
          request(`${base}/members/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
          }),
      },
      nominations: {
        importTitle: (title: string): Promise<MovieImportResult> =>
          request(`${base}/nominations/import`, {
            method: "POST",
            body: JSON.stringify({ title }),
          }),
        list: (signal?: AbortSignal): Promise<Nomination[]> =>
          request(`${base}/nominations`, { signal }),
        create: async (input: {
          movieId: number;
          comment: string;
        }): Promise<Nomination> => {
          const nomination = await request<Nomination>(
            `${base}/nominations`,
            {
              method: "POST",
              body: JSON.stringify(input),
            },
            (nomination) =>
              nomination.movie ? { kind: "nomination", nomination } : undefined,
          );
          enrichMovieAfterNomination(input.movieId);
          return nomination;
        },
        updateComment: (nominationId: number, comment: string): Promise<void> =>
          request(`${base}/nominations`, {
            method: "PATCH",
            body: JSON.stringify({ id: nominationId, comment }),
          }),
        setCompleted: (
          nominationId: number,
          completedAt: Date | null,
        ): Promise<void> =>
          request(`${base}/nominations`, {
            method: "PATCH",
            body: JSON.stringify({ id: nominationId, completedAt }),
          }),
        delete: (nominationId: number): Promise<void> =>
          request(`${base}/nominations?id=${nominationId}`, {
            method: "DELETE",
          }),
      },
      nomcoms: {
        create: (nominationId: number, comment: string): Promise<void> =>
          request(`${base}/nomcoms`, {
            method: "POST",
            body: JSON.stringify({ nominationId, comment }),
          }),
        update: (id: number, comment: string): Promise<void> =>
          request(`${base}/nomcoms`, {
            method: "PATCH",
            body: JSON.stringify({ id, comment }),
          }),
      },
      seen: {
        create: (movieId: number): Promise<void> =>
          request(`${base}/seen`, {
            method: "POST",
            body: JSON.stringify({ movieId }),
          }),
        delete: (movieId: number): Promise<void> =>
          request(`${base}/seen?movieId=${movieId}`, { method: "DELETE" }),
      },
      suggestions: {
        create: (exclude: string[]): Promise<Nomination[]> =>
          request<{ suggestions: Nomination[] }>(
            `${base}/extensions/specific`,
            {
              method: "POST",
              body: JSON.stringify({ exclude }),
            },
          ).then(get("suggestions")),
      },
      movieClub: {
        vote: (
          nominationId: number,
          action: "vote" | "unvote",
        ): Promise<{ votesLeft: number }> =>
          request(`${base}/extensions/movieclub`, {
            method: "POST",
            body: JSON.stringify({ action, nominationId }),
          }),
      },
    };
  },
  publicTheatre: (code: string): Promise<PublicTheatre> =>
    request(`/api/join/${encodeURIComponent(code)}`),
  tmdb: {
    search: (query: string, signal?: AbortSignal): Promise<Movie[]> =>
      request<{ results: Movie[] }>(
        `/api/tmdb/search?query=${encodeURIComponent(query)}`,
        { signal },
      ).then(get("results")),
  },
};

export type TheatreApi = ReturnType<typeof api.theatre>;
