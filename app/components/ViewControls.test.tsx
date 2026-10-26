// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ViewControls } from "./ViewControls";
import type { Movie } from "@/src/db/schema";

const movie = {
  id: 1, tmdbId: 123, details: { title: "Alien" }, ratings: {}, createdAt: new Date(),
} as Movie;
vi.mock("@/app/lib/useMovieSearch", () => ({
  useMovieSearch: () => ({ results: [movie], isLoading: false, error: "" }),
}));
vi.mock("@/app/components/MovieSearchResults", () => ({
  MovieSearchResults: ({ onSelect, onQuickAdd }: {
    onSelect: (movie: Movie) => void; onQuickAdd: (movie: Movie) => void;
  }) => (
    <div>
      <button onClick={() => onSelect(movie)}>Select Alien</button>
      <button onClick={() => onQuickAdd(movie)}>Quick add Alien</button>
    </div>
  ),
}));
vi.mock("@/app/components/NominationForm", () => ({
  NominationForm: ({ onSubmit }: { onSubmit: (comment: string) => void }) =>
    <button onClick={() => onSubmit("A classic")}>Save recommendation</button>,
}));
afterEach(cleanup);
const props = {
  state: { sort: "recent", filters: [] },
  onChange: vi.fn(),
  existing: new Set<number>(),
  isSubmitting: false,
};

it("preserves expanding movie search, duplicate notices and Escape", async () => {
  render(<ViewControls {...props} existing={new Set([123])} onNominate={vi.fn()} />);
  const input = screen.getByRole("textbox");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "Alien" } });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Sort by" })).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Quick add Alien" }));
  expect(screen.getByRole("alert").textContent).toBe("This movie is already on the list.");
  fireEvent.keyDown(input, { key: "Escape" });
  expect((input as HTMLInputElement).value).toBe("");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("keeps movie quick-add and recommendation submission in the wrapper", async () => {
  const nominate = vi.fn().mockResolvedValue(true);
  render(<ViewControls {...props} onNominate={nominate} />);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Alien" } });
  fireEvent.click(screen.getByRole("button", { name: "Quick add Alien" }));
  await waitFor(() => expect(nominate).toHaveBeenCalledWith(movie, ""));
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(""));
  fireEvent.change(input, { target: { value: "Alien" } });
  fireEvent.click(screen.getByRole("button", { name: "Select Alien" }));
  fireEvent.click(screen.getByRole("button", { name: "Save recommendation" }));
  await waitFor(() => expect(nominate).toHaveBeenCalledWith(movie, "A classic"));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Save recommendation" })).toBeNull());
});

it("keeps movie sorting and filtering available without nomination access", () => {
  const change = vi.fn();
  render(<ViewControls {...props} onChange={change} />);
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
  fireEvent.click(screen.getByRole("button", { name: "Title" }));
  expect(change).toHaveBeenCalledWith({ sort: "title", filters: [] });
});
