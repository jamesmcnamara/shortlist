// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/app/lib/api";
import type { Movie } from "@/src/db/schema";
import { MovieRefresh } from "./MovieRefresh";
import { MovieDetail } from "./MovieDetail";
import { nomination } from "@/app/lib/fantasy-fixtures";

const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: session.signedIn ? { user: { id: "user" } } : null,
    }),
  },
}));
const initialMovie = nomination(
  1,
  "maya",
  "Before refresh",
  "2026-01-01",
  null,
).movie;
const movie = {
  ...initialMovie,
  details: { ...initialMovie.details, genres: [] },
};
beforeEach(() => {
  session.signedIn = true;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("shared movie refresh", () => {
  it("hides the action while signed out", () => {
    session.signedIn = false;
    render(<MovieRefresh movieId={1} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("disables the action until completion and delivers the updated movie", async () => {
    let finish!: (value: { movie: Movie; failed: string[] }) => void;
    const refresh = vi.spyOn(api.movies, "refresh").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onRefreshed = vi.fn();
    render(<MovieRefresh movieId={1} onRefreshed={onRefreshed} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh movie" }));
    const busy = screen.getByRole("button", { name: "Refreshing movie..." });
    expect(busy.hasAttribute("disabled")).toBe(true);
    fireEvent.click(busy);
    expect(refresh).toHaveBeenCalledOnce();
    finish({ movie, failed: [] });
    await screen.findByRole("button", { name: "Refresh movie" });
    expect(onRefreshed).toHaveBeenCalledWith(movie);
  });

  it("shows partial failures while applying successful updates, then allows retry", async () => {
    const refresh = vi
      .spyOn(api.movies, "refresh")
      .mockResolvedValueOnce({ movie, failed: ["IMDb trivia"] })
      .mockResolvedValue({ movie, failed: [] });
    const onRefreshed = vi.fn();
    render(<MovieRefresh movieId={1} onRefreshed={onRefreshed} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh movie" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't refresh IMDb trivia",
    );
    expect(onRefreshed).toHaveBeenCalledWith(movie);
    fireEvent.click(screen.getByRole("button", { name: "Refresh movie" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("surfaces request failures without applying a fake update", async () => {
    vi.spyOn(api.movies, "refresh").mockRejectedValue(
      new Error("Network unavailable"),
    );
    const onRefreshed = vi.fn();
    render(<MovieRefresh movieId={1} onRefreshed={onRefreshed} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh movie" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Network unavailable",
    );
    expect(onRefreshed).not.toHaveBeenCalled();
  });

  it("updates search-detail content even when only some integrations succeed", async () => {
    vi.spyOn(api.movies, "refresh").mockResolvedValue({
      movie: {
        ...movie,
        details: {
          ...movie.details,
          title: "After refresh",
          trivia: {
            url: "https://www.imdb.com/title/tt0133093/trivia/",
            fetchedAt: "2026-01-01T00:00:00Z",
            items: ["A new fact."],
          },
        },
      },
      failed: ["Box Office Mojo"],
    });
    render(<MovieDetail movie={movie} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh movie" }));
    expect(
      await screen.findByRole("heading", { name: "After refresh" }),
    ).toBeTruthy();
    expect(screen.getByText("A new fact.")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Refresh movie" }),
    ).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("Box Office Mojo");
  });
});
