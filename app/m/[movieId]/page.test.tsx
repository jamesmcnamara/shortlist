import { beforeEach, expect, it, vi } from "vitest";
import MovieDetailPage from "./page";

const findMovie = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/movie-metadata", () => ({ findMovieById: findMovie }));
vi.mock("./MoviePage", () => ({ MoviePage: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

beforeEach(() => vi.resetAllMocks());

it("loads a public movie by its stored ID", async () => {
  const movie = { id: 42, tmdbId: 123, details: { title: "Arrival" } };
  findMovie.mockResolvedValue(movie);
  const result = await MovieDetailPage({
    params: Promise.resolve({ movieId: "42" }),
  });
  expect(findMovie).toHaveBeenCalledWith(42);
  expect(result.props.movie).toBe(movie);
});

it.each(["0", "-1", "1.5", "01", "abc", "2147483648", "1e2"])(
  "returns not found for invalid movie ID %s",
  async (movieId) => {
    await expect(
      MovieDetailPage({ params: Promise.resolve({ movieId }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(findMovie).not.toHaveBeenCalled();
  },
);

it("returns not found for a missing movie", async () => {
  findMovie.mockResolvedValue(null);
  await expect(
    MovieDetailPage({ params: Promise.resolve({ movieId: "42" }) }),
  ).rejects.toThrow("NOT_FOUND");
});
