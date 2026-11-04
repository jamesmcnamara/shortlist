// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Movie } from "@/src/db/schema";
import { useMovieSearchHistory } from "./useMovieSearchHistory";

const movie = { id: 42, tmdbId: 123, details: { title: "Arrival" } } as Movie;

beforeEach(() => {
  window.history.replaceState({ __NA: true, tree: "search" }, "", "/");
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("updates the movie URL without discarding Next's search history tree", async () => {
  const { result } = renderHook(useMovieSearchHistory);
  act(() => result.current.selectMovie(movie));
  expect(window.location.pathname).toBe("/m/42");
  expect(window.history.state).toMatchObject({ __NA: true, tree: "search" });
  expect(result.current.selected).toBe(movie);
  act(() => result.current.closeMovie());
  await waitFor(() => expect(result.current.selected).toBeNull());
  expect(window.location.pathname).toBe("/");
  act(() => window.history.forward());
  await waitFor(() => expect(result.current.selected).toBe(movie));
  expect(window.location.pathname).toBe("/m/42");
});
