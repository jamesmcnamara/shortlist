import { get } from "shades";
import { z } from "zod";
import type {
  Feedback,
  FeedbackCategory,
  Nomination,
  Person,
  TheatreRole,
  User,
} from "@/src/db/schema";
import type { SafeTheatre } from "@/lib/auth/require-theatre";
import type { Movie } from "@/src/db/schema";
import type { MovieImportResult } from "./bulk-movie-import";
import type { JustWatchAvailability } from "./justwatch-types";
import type { BoxOfficeData } from "./box-office";

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

type MutationListener = (path: string, method: string) => Promise<void>;
const mutationListeners = new Set<MutationListener>();

export function subscribeToMutations(listener: MutationListener) {
  let active = true;
  const subscription: MutationListener = async (path, method) => {
    if (active) await listener(path, method);
  };
  mutationListeners.add(subscription);
  return () => {
    active = false;
    mutationListeners.delete(subscription);
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  await Promise.all(listeners.map((listener) => listener(path, method)));
  return data as T;
}

export interface TheatreSummary {
  id: string;
  name: string;
  watchlistFor: string | null;
  role: TheatreRole | null;
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

/** What a seen toggle reports back: the theatre's viewers for that movie. */
export interface SeenUpdate {
  movieId: number;
  seenBy: Person[];
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
  theatre: { name: string; description: string | null };
  nominations: Nomination[];
}

/**
 * Theatre-scoped calls bind the theatre ID once rather than threading it through
 * every call site.
 */
export const api = {
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
        get: (): Promise<{ enabled: boolean; configured: boolean }> =>
          request(`${base}/notifications`),
        set: (
          enabled: boolean,
        ): Promise<{ enabled: boolean; configured: boolean }> =>
          request(`${base}/notifications`, {
            method: "PUT",
            body: JSON.stringify({ enabled }),
          }),
      },
      get: (): Promise<TheatreDetail> => request(base),
      refreshJustWatch: (movieId: number): Promise<JustWatchAvailability> =>
        request(`${base}/justwatch`, {
          method: "POST",
          body: JSON.stringify({ movieId }),
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
      update: (input: {
        name?: string;
        description?: string;
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
        create: (input: {
          movieId: number;
          comment: string;
        }): Promise<Nomination> =>
          request(`${base}/nominations`, {
            method: "POST",
            body: JSON.stringify(input),
          }),
        updateComment: (
          nominationId: number,
          comment: string,
        ): Promise<Nomination> =>
          request(`${base}/nominations`, {
            method: "PATCH",
            body: JSON.stringify({ id: nominationId, comment }),
          }),
        setCompleted: (
          nominationId: number,
          completed: boolean,
        ): Promise<Nomination> =>
          request(`${base}/nominations`, {
            method: "PATCH",
            body: JSON.stringify({ id: nominationId, completed }),
          }),
        delete: (nominationId: number): Promise<void> =>
          request(`${base}/nominations?id=${nominationId}`, {
            method: "DELETE",
          }),
      },
      nomcoms: {
        create: (nominationId: number, comment: string): Promise<Nomination> =>
          request(`${base}/nomcoms`, {
            method: "POST",
            body: JSON.stringify({ nominationId, comment }),
          }),
        update: (id: number, comment: string): Promise<Nomination> =>
          request(`${base}/nomcoms`, {
            method: "PATCH",
            body: JSON.stringify({ id, comment }),
          }),
      },
      seen: {
        create: (movieId: number): Promise<SeenUpdate> =>
          request(`${base}/seen`, {
            method: "POST",
            body: JSON.stringify({ movieId }),
          }),
        delete: (movieId: number): Promise<SeenUpdate> =>
          request(`${base}/seen?movieId=${movieId}`, { method: "DELETE" }),
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
