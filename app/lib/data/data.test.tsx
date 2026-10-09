// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { api, ApiError } from "../api";
import { DataProvider } from "./DataProvider";
import { DataBoundary } from "./DataBoundary";
import { useNominations, useRooms, useRoomDetail } from "./queries";
import { RoomProvider, useRoom } from "@/app/rooms/[roomId]/RoomContext";

const auth = vi.hoisted(() => ({
  data: {
    session: { id: "session-alice" },
    user: { id: "alice" },
  } as { session: { id: string }; user: { id: string } } | null,
  isPending: false,
  error: null as { message: string } | null,
  refetch: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => auth },
}));

const navigation = vi.hoisted(() => ({
  pathname: "/rooms/11111111-1111-1111-1111-111111111111",
  redirect: vi.fn((path: string) => {
    throw new Error(`Redirect: ${path}`);
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  redirect: navigation.redirect,
}));

const room = { id: "11111111-1111-1111-1111-111111111111" };
const otherRoom = { id: "22222222-2222-2222-2222-222222222222" };
const base = `/api/rooms/${room.id}`;
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => Response.json(body, { status });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <SWRConfig
        value={{
          dedupingInterval: 0,
          focusThrottleInterval: 0,
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    </DataProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.data = { session: { id: "session-alice" }, user: { id: "alice" } };
  auth.isPending = false;
  auth.error = null;
  navigation.pathname = `/rooms/${room.id}`;
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shared data cache", () => {
  it("shows a revisited room before its pending refresh finishes", async () => {
    const refreshed = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1, comment: "Cached" }]))
      .mockResolvedValueOnce(json([{ id: 2, comment: "Other room" }]))
      .mockReturnValueOnce(refreshed.promise);
    const { result, rerender } = renderHook(
      ({ current }) => useNominations(current),
      { wrapper: Wrapper, initialProps: { current: room } },
    );
    await waitFor(() =>
      expect(result.current.data?.[0].comment).toBe("Cached"),
    );
    rerender({ current: otherRoom });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0].id).toBe(2));

    rerender({ current: room });
    expect(result.current.data?.[0].comment).toBe("Cached");
    expect(result.current.isLoading).toBe(false);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await act(async () =>
      refreshed.resolve(json([{ id: 1, comment: "Fresh" }])),
    );
    await waitFor(() => expect(result.current.data?.[0].comment).toBe("Fresh"));
  });

  it("deduplicates simultaneous readers", async () => {
    fetchMock.mockResolvedValue(json([]));
    const { result } = renderHook(
      () => [useNominations(room), useNominations(room)],
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(result.current.every((query) => query.data)).toBe(true),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${base}/nominations`, {
      cache: "no-store",
      headers: undefined,
    });
  });

  it("refreshes shared layout queries when navigating between a room and settings", async () => {
    const refresh = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1, comment: "Cached" }]))
      .mockReturnValueOnce(refresh.promise);
    const { result, rerender } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    navigation.pathname = `/rooms/${room.id}/settings`;
    rerender();
    expect(result.current.data?.[0].comment).toBe("Cached");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => refresh.resolve(json([{ id: 1, comment: "New" }])));
    await waitFor(() => expect(result.current.data?.[0].comment).toBe("New"));
  });

  it("does not duplicate an in-progress fetch on navigation", async () => {
    const firstRead = deferred<Response>();
    fetchMock.mockReturnValue(firstRead.promise);
    const { result, rerender } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    navigation.pathname = `/rooms/${room.id}/settings`;
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => firstRead.resolve(json([{ id: 1 }])));
    await waitFor(() => expect(result.current.data).toBeDefined());
  });

  it.each(["focus", "online"])(
    "refreshes on %s without clearing content",
    async (event) => {
      const refresh = deferred<Response>();
      fetchMock
        .mockResolvedValueOnce(json([{ id: 1, comment: "Cached" }]))
        .mockReturnValueOnce(refresh.promise);
      const { result } = renderHook(() => useNominations(room), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.data).toBeDefined());
      act(() => window.dispatchEvent(new Event(event)));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(result.current.data?.[0].comment).toBe("Cached");
      await act(async () =>
        refresh.resolve(json([{ id: 1, comment: "Updated" }])),
      );
      await waitFor(() =>
        expect(result.current.data?.[0].comment).toBe("Updated"),
      );
    },
  );

  it("refreshes all mounted room reads after writes, including 204 responses", async () => {
    let deleted = false;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "DELETE") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return json(deleted ? [] : [{ id: 1 }]);
    });
    const { result } = renderHook(
      () => [useNominations(room), useNominations(otherRoom)],
      { wrapper: Wrapper },
    );
    await waitFor(() =>
      expect(result.current.every((query) => query.data?.length === 1)).toBe(
        true,
      ),
    );
    await act(async () => {
      await api.room(room.id).nominations.delete(1);
    });
    expect(result.current.map((query) => query.data)).toEqual([[], []]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not let an older read overwrite a completed mutation", async () => {
    const stale = deferred<Response>();
    let reads = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === "PATCH") return json({ id: 1, comment: "New" });
      reads += 1;
      if (reads === 2) return stale.promise;
      return json([{ id: 1, comment: reads === 1 ? "Old" : "New" }]);
    });

    const { result } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data?.[0].comment).toBe("Old"));
    let pendingRead: Promise<unknown>;
    act(() => {
      pendingRead = result.current.retry();
    });
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => {
      await api.room(room.id).nominations.updateComment(1, "New");
    });
    expect(result.current.data?.[0].comment).toBe("New");
    await act(async () => {
      stale.resolve(json([{ id: 1, comment: "Old" }]));
      await pendingRead;
    });
    expect(result.current.data?.[0].comment).toBe("New");
  });

  it("refreshes room nominations after a per-title import write", async () => {
    let imported = false;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        expect(input).toBe(`${base}/nominations/import`);
        expect(init.body).toBe(JSON.stringify({ title: "Arrival" }));
        imported = true;
        return json({
          status: "added",
          movie: { id: 1, title: "Arrival", year: 2016 },
        });
      }
      return json(imported ? [{ id: 1 }] : []);
    });
    const { result } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toEqual([]));
    await act(async () => {
      const outcome = await api.room(room.id).nominations.importTitle("Arrival");
      expect(outcome).toEqual({
        status: "added",
        movie: { id: 1, title: "Arrival", year: 2016 },
      });
    });
    expect(result.current.data).toEqual([{ id: 1 }]);
  });

  it("keeps cached content and exposes temporary refresh failures", async () => {
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1 }]))
      .mockResolvedValueOnce(json({ error: "Temporarily unavailable" }, 503));
    const { result } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(result.current.error?.message).toBe("Temporarily unavailable");
  });

  it.each([401, 403, 404])(
    "hides cached content after an access error (%s)",
    async (status) => {
      fetchMock
        .mockResolvedValueOnce(json([{ id: 1 }]))
        .mockResolvedValueOnce(json({ error: "Access denied" }, status));
      const { result } = renderHook(() => useNominations(room), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.data).toBeDefined());
      await act(async () => {
        await result.current.retry();
      });
      expect(result.current.data).toBeUndefined();
      expect(result.current.error).toBeInstanceOf(ApiError);
    },
  );

  it("does not alter the cache when a write fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1 }]))
      .mockResolvedValueOnce(json({ error: "Could not save" }, 500));
    const { result } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await expect(
      api.room(room.id).nominations.delete(1),
    ).rejects.toThrow("Could not save");
    expect(result.current.data).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves both changes when concurrent writes finish out of order", async () => {
    const firstWrite = deferred<Response>();
    let nominations = [{ id: 1 }, { id: 2 }];
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === "DELETE") {
        if (String(input).endsWith("id=1")) return firstWrite.promise;
        nominations = nominations.filter(({ id }) => id !== 2);
        return new Response(null, { status: 204 });
      }
      return json(nominations);
    });
    const { result } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    const client = api.room(room.id);
    const deletingFirst = client.nominations.delete(1);
    await act(async () => {
      await client.nominations.delete(2);
    });
    expect(result.current.data).toEqual([{ id: 1 }]);
    await act(async () => {
      nominations = [];
      firstWrite.resolve(new Response(null, { status: 204 }));
      await deletingFirst;
    });
    expect(result.current.data).toEqual([]);
  });

  it("reports malformed responses instead of leaving the page loading forever", async () => {
    fetchMock.mockResolvedValue(new Response("not JSON"));
    const { result } = renderHook(() => useRooms(), { wrapper: Wrapper });
    await waitFor(() =>
      expect(result.current.error?.message).toBe(
        "The server returned an invalid response.",
      ),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it("drops a deleted room's inactive cached data", async () => {
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1 }]))
      .mockResolvedValueOnce(json([{ id: 2 }]))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json([{ id: 2 }]))
      .mockResolvedValueOnce(json({ error: "Gone" }, 404));
    const { result, rerender } = renderHook(
      ({ current }) => useNominations(current),
      { wrapper: Wrapper, initialProps: { current: room } },
    );
    await waitFor(() => expect(result.current.data?.[0].id).toBe(1));
    rerender({ current: otherRoom });
    await waitFor(() => expect(result.current.data?.[0].id).toBe(2));
    await act(async () => {
      await api.room(room.id).delete();
    });
    rerender({ current: room });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.error?.message).toBe("Gone"));
  });

  it("does not fetch protected data until authentication resolves", async () => {
    auth.data = null;
    auth.isPending = true;
    fetchMock.mockResolvedValue(json([]));
    const { result, rerender } = renderHook(() => useRooms(), {
      wrapper: Wrapper,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    auth.data = { session: { id: "session-alice" }, user: { id: "alice" } };
    auth.isPending = false;
    rerender();
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("restores the same user's cache after logout and a new login", async () => {
    const secondLogin = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1, comment: "Private" }]))
      .mockReturnValueOnce(secondLogin.promise);
    const { result, rerender } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(result.current.data?.[0].comment).toBe("Private"),
    );
    auth.data = null;
    rerender();
    expect(result.current.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    auth.data = { session: { id: "new-session" }, user: { id: "alice" } };
    rerender();
    expect(result.current.data?.[0].comment).toBe("Private");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () =>
      secondLogin.resolve(json([{ id: 1, comment: "New session" }])),
    );
    await waitFor(() =>
      expect(result.current.data?.[0].comment).toBe("New session"),
    );
  });

  it("does not let an old account's in-flight write refresh the new account", async () => {
    const write = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1, comment: "Alice" }]))
      .mockReturnValueOnce(write.promise)
      .mockResolvedValueOnce(json([{ id: 1, comment: "Bob" }]));
    const { result, rerender } = renderHook(() => useNominations(room), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data?.[0].comment).toBe("Alice"));
    const saving = api
      .room(room.id)
      .nominations.updateComment(1, "Alice update");
    auth.data = { session: { id: "session-bob" }, user: { id: "bob" } };
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.[0].comment).toBe("Bob"));
    await act(async () => {
      write.resolve(json({ id: 1, comment: "Alice update" }));
      await saving;
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.data?.[0].comment).toBe("Bob");
  });
});

describe("data boundary", () => {
  it("shows a loading state only while there is no data", () => {
    render(
      <DataBoundary pending retry={vi.fn()}>
        Private content
      </DataBoundary>,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole("status", { name: "Loading..." })).toBeTruthy();
    expect(screen.queryByText("Private content")).toBeNull();
  });

  it("keeps stale content visible with a retryable error", () => {
    const retry = vi.fn();
    render(
      <DataBoundary pending={false} error={new Error("Offline")} retry={retry}>
        Cached content
      </DataBoundary>,
      { wrapper: Wrapper },
    );
    expect(screen.getByText("Cached content")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "last loaded content",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("hides private content when access is revoked", () => {
    render(
      <DataBoundary
        pending={false}
        error={new ApiError("Gone", 404)}
        retry={vi.fn()}
      >
        Private content
      </DataBoundary>,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText("Private content")).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Back to your rooms" })
        .getAttribute("href"),
    ).toBe("/rooms");
  });

  it("redirects to sign-in with the return path", () => {
    auth.data = null;
    expect(() =>
      render(
        <DataBoundary pending retry={vi.fn()}>
          Private content
        </DataBoundary>,
        { wrapper: Wrapper },
      ),
    ).toThrow("Redirect:");
    expect(navigation.redirect).toHaveBeenCalledWith(
      `/auth/sign-in?next=${encodeURIComponent(`/rooms/${room.id}`)}`,
    );
  });
});

describe("room integration", () => {
  it("loads independent room resources in parallel and shares detail with settings", async () => {
    const detail = deferred<Response>();
    const rooms = deferred<Response>();
    const nominations = deferred<Response>();
    fetchMock.mockImplementation(async (input) => {
      if (input === base) return detail.promise;
      if (input === "/api/rooms?previews=true") return rooms.promise;
      if (input === `${base}/nominations`) return nominations.promise;
      throw new Error(`Unexpected request: ${input}`);
    });

    function Content() {
      const { room, noms } = useRoom();
      const { data } = useRoomDetail(room);
      return (
        <p>
          {data?.room.name}: {noms.length} movies
        </p>
      );
    }
    render(
      <RoomProvider roomId={room.id}>
        <Content />
      </RoomProvider>,
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await act(async () => {
      detail.resolve(
        json({
          room: { ...room, name: "Watchlist" },
          membership: { role: "admin" },
          members: [],
        }),
      );
      rooms.resolve(json([{ ...room, posterUrls: [] }]));
      nominations.resolve(json([{ id: 1 }]));
    });
    expect(await screen.findByText("Watchlist: 1 movies")).toBeTruthy();
  });
});
