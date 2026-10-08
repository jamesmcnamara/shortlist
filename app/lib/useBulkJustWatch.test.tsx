// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBulkJustWatch } from "./useBulkJustWatch";
import { ApiError } from "./api";
import type { Movie, MovieDetails } from "@/src/db/schema";
import type { JustWatchAvailability } from "./justwatch-types";

const availability: JustWatchAvailability = {
  country: "US", checkedAt: "2026-10-06T12:00:00Z",
  status: "matched", url: null, offers: [],
};
const movie = (id: number): Movie => ({
  id, tmdbId: id, createdAt: new Date(),
  details: { title: `Movie ${id}` } as MovieDetails,
  ratings: { services: [], raw: {} },
});
const deferred = () => {
  let resolve!: (value: JustWatchAvailability) => void;
  const promise = new Promise<JustWatchAvailability>((done) => { resolve = done; });
  return { resolve, promise };
};
afterEach(cleanup);

describe("bulk JustWatch updates", () => {
  it("runs one movie at a time and deduplicates movie IDs", async () => {
    const first = deferred();
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(availability);
    const { result } = renderHook(() => useBulkJustWatch("room", [movie(1), movie(1), movie(2)], refresh));
    let finished!: Promise<void>;
    act(() => { finished = result.current.start(); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRunning).toBe(true);
    await act(async () => { first.resolve(availability); await finished; });
    expect(refresh.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(result.current.rows.map((row) => row.status)).toEqual(["updated", "updated"]);
  });

  it("reports failures and unmatched movies separately, continues, and retries failures only", async () => {
    const refresh = vi.fn()
      .mockRejectedValueOnce(new Error("Unavailable"))
      .mockResolvedValueOnce({ ...availability, status: "not_found" })
      .mockResolvedValue(availability);
    const { result } = renderHook(() => useBulkJustWatch("room", [movie(1), movie(2), movie(3)], refresh));
    await act(async () => { await result.current.start(); });
    expect(result.current.rows.map((row) => row.status)).toEqual(["failed", "not_found", "updated"]);
    expect(result.current.rows[0].error).toBe("Unavailable");
    await act(async () => { await result.current.retry(); });
    expect(refresh.mock.calls.map(([id]) => id)).toEqual([1, 2, 3, 1]);
    expect(result.current.rows.map((row) => row.status)).toEqual(["updated", "not_found", "updated"]);
  });

  it("stops after the current movie and resumes only remaining movies", async () => {
    const first = deferred();
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(availability);
    const { result } = renderHook(() => useBulkJustWatch("room", [movie(1), movie(2)], refresh));
    let finished!: Promise<void>;
    act(() => { finished = result.current.start(); });
    act(() => { result.current.stop(); });
    expect(result.current.isStopping).toBe(true);
    await act(async () => { first.resolve(availability); await finished; });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.rows[1].status).toBe("pending");
    await act(async () => { await result.current.resume(); });
    expect(refresh.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  });

  it("prevents duplicate starts", async () => {
    const first = deferred();
    const refresh = vi.fn().mockReturnValue(first.promise);
    const { result } = renderHook(() => useBulkJustWatch("room", [movie(1)], refresh));
    let finished!: Promise<void>;
    act(() => { finished = result.current.start(); });
    await act(async () => { await result.current.start(); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { first.resolve(availability); await finished; });
  });

  it("stops on lost access and does not process pending rows when retrying the failure", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new ApiError("Access lost", 401)).mockResolvedValue(availability);
    const { result } = renderHook(() => useBulkJustWatch("room", [movie(1), movie(2)], refresh));
    await act(async () => { await result.current.start(); });
    expect(result.current.rows.map((row) => row.status)).toEqual(["failed", "pending"]);
    await act(async () => { await result.current.retry(); });
    expect(refresh.mock.calls.map(([id]) => id)).toEqual([1, 1]);
    expect(result.current.rows[1].status).toBe("pending");
  });

  it("does not start further requests after leaving the room", async () => {
    const first = deferred();
    const refresh = vi.fn().mockReturnValue(first.promise);
    const { result, unmount } = renderHook(() => useBulkJustWatch("room", [movie(1), movie(2)], refresh));
    let finished!: Promise<void>;
    act(() => { finished = result.current.start(); });
    unmount();
    first.resolve(availability);
    await finished;
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("resets progress on room changes without letting the old run update the new room", async () => {
    const first = deferred();
    const refresh = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(availability);
    const { result, rerender } = renderHook(
      ({ roomId }) => useBulkJustWatch(roomId, [movie(1), movie(2)], refresh),
      { initialProps: { roomId: "first" } },
    );
    let finished!: Promise<void>;
    act(() => { finished = result.current.start(); });
    rerender({ roomId: "second" });
    await waitFor(() => expect(result.current.rows).toEqual([]));
    await act(async () => { first.resolve(availability); await finished; });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRunning).toBe(false);
  });
});
