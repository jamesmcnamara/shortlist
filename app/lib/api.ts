import { get } from "shades";
import type {
  Feedback,
  FeedbackCategory,
  Nomination,
  RoomRole,
  User,
} from "@/src/db/schema";
import type { SafeRoom } from "@/lib/auth/require-room";
import type { Movie } from "@/src/db/schema";
import { roomApiKey } from "@/lib/room-path";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body
      ? { "content-type": "application/json", ...init.headers }
      : init?.headers,
  });

  if (response.status === 204) return undefined as T;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(data?.error ?? "Request failed.", response.status);
  }
  return data as T;
}

export interface RoomSummary {
  id: string;
  slug: string;
  ownerId: string;
  name: string;
  role: RoomRole;
}

/** As `RoomSummary`, but scoped to a specific movie via `?movieId=`. */
export interface RoomSummaryWithMovie extends RoomSummary {
  hasMovie: boolean;
}

export interface RoomMemberSummary extends User {
  role: RoomRole;
  joinedAt: string;
}

/** What a seen toggle reports back: the room's viewers for that movie. */
export interface SeenUpdate {
  movieId: number;
  seenBy: User[];
}

export interface RoomDetail {
  room: SafeRoom;
  inviteCode?: string;
  adminInviteCode?: string;
  membership: { userId: string; role: RoomRole };
  members: RoomMemberSummary[];
}

/**
 * Room-scoped calls bind the owner's handle and room slug once rather than
 * threading the canonical room identity through every call site.
 */
export const api = {
  rooms: {
    list: (): Promise<RoomSummary[]> => request("/api/rooms"),
    listForMovie: (movieId: number): Promise<RoomSummaryWithMovie[]> =>
      request(`/api/rooms?movieId=${movieId}`),
    create: (input: {
      name: string;
      slug?: string;
    }): Promise<SafeRoom> =>
      request("/api/rooms", { method: "POST", body: JSON.stringify(input) }),
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
  room: (ownerId: string, slug: string) => {
    const base = `/api/rooms/${encodeURIComponent(roomApiKey({ ownerId, slug }))}`;
    return {
      get: (): Promise<RoomDetail> => request(base),
      update: (input: { name?: string }): Promise<SafeRoom> =>
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
        setRole: (userId: string, role: RoomRole): Promise<void> =>
          request(`${base}/members/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
          }),
      },
      nominations: {
        list: (): Promise<Nomination[]> => request(`${base}/nominations`),
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
  tmdb: {
    search: (query: string, signal?: AbortSignal): Promise<Movie[]> =>
      request<{ results: Movie[] }>(
        `/api/tmdb/search?query=${encodeURIComponent(query)}`,
        { signal },
      ).then(get("results")),
  },
};

export type RoomApi = ReturnType<typeof api.room>;
