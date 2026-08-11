import type { Nomination, User } from "@/src/db/schema";
import type { MovieSearchResultData } from "@/app/components/MovieSearchResult";

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T> (path: string, init?: RequestInit): Promise<T> {
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

export const api = {
  nominations: {
    list: (): Promise<Nomination[]> => request("/api/nominations"),
    create: (input: { tmdbId: number; comment: string }): Promise<Nomination> =>
      request("/api/nominations", { method: "POST", body: JSON.stringify(input) }),
  },
  users: {
    list: (): Promise<User[]> => request("/api/users"),
  },
  votes: {
    create: (nominationId: number): Promise<Nomination> =>
      request("/api/votes", { method: "POST", body: JSON.stringify({ nominationId }) }),
    delete: (nominationId: number): Promise<Nomination> =>
      request("/api/votes", { method: "DELETE", body: JSON.stringify({ nominationId }) }),
  },
  nomcoms: {
    create: (nominationId: number, comment: string): Promise<Nomination> =>
      request("/api/nomcoms", {
        method: "POST",
        body: JSON.stringify({ nominationId, comment }),
      }),
  },
  tmdb: {
    search: (query: string, signal?: AbortSignal): Promise<{ results: MovieSearchResultData[] }> =>
      request(`/api/tmdb/search?query=${encodeURIComponent(query)}`, { signal }),
  },
};

export { ApiError };
