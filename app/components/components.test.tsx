// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { NominationForm } from "@/app/components/NominationForm";
import { ViewControls } from "@/app/components/ViewControls";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import loadingStyles from "@/app/components/LoadingOverlay.module.css";
import { MovieSearchResult } from "@/app/components/MovieSearchResult";
import type { MovieDetails, Nomination } from "@/src/db/schema";

const nomination: Nomination = {
  id: 1,
  roomId: "room",
  userId: "user",
  movieId: 1,
  comment: "A recommendation",
  completed: false,
  createdAt: new Date(),
  movie: {
    id: 1,
    tmdbId: 123,
    createdAt: new Date(),
    details: {
      id: 123,
      title: "A Movie",
      overview: "A description",
      release_date: "2025-01-01",
      posterUrl: "https://example.com/poster.jpg",
      year: 2025,
    } as MovieDetails,
    ratings: { raw: {}, services: [] },
  },
  nomcoms: [],
  nominator: { id: "user", name: "Alice", email: "alice@example.com" },
  seenBy: [],
};

afterEach(cleanup);

describe("high-churn component smoke tests", () => {
  it("preserves the existing search result add action", () => {
    const onAdd = vi.fn();
    const onSelect = vi.fn();
    render(
      <MovieSearchResult
        movie={nomination.movie}
        onAdd={onAdd}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add A Movie to a list" }),
    );
    expect(onAdd).toHaveBeenCalledWith(nomination.movie);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders an accessible loading overlay", () => {
    render(<LoadingOverlay label="Searching movies..." />);

    expect(
      screen.getByRole("status", { name: "Searching movies..." }),
    ).toBeTruthy();
  });

  it("keeps fullscreen and contained loaders while supporting a compact inline loader", () => {
    const { rerender } = render(<LoadingOverlay />);
    const loader = () => screen.getByRole("status", { name: "Loading..." });

    expect(loader().className).toBe(loadingStyles.overlay);
    expect(loader().querySelector("svg")?.getAttribute("width")).toBe("56");
    expect(loader().querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 360 360",
    );

    rerender(<LoadingOverlay fullscreen={false} />);
    expect(loader().className).toBe(loadingStyles.contained);
    expect(loader().querySelector("svg")?.getAttribute("width")).toBe("56");

    rerender(<LoadingOverlay inline />);
    expect(loader().className).toBe(loadingStyles.inline);
    expect(loader().querySelector("svg")?.getAttribute("width")).toBe("20");
    expect(loader().querySelector("svg")?.getAttribute("viewBox")).toBe(
      "25 0 360 360",
    );
    expect(loader().querySelector("path")?.getAttribute("d")).toMatch(
      /^M205 25a155 155 0 1 1 0 310a155 155 0 1 1 0-310z/,
    );
    expect(loader().querySelector("path")?.getAttribute("fill-rule")).toBe(
      "evenodd",
    );
  });

  it("shows a compact loader only while quick-adding a search result", async () => {
    let finishAdding!: () => void;
    const pendingAdd = new Promise<void>((resolve) => {
      finishAdding = resolve;
    });
    const onQuickAdd = vi.fn(() => pendingAdd);
    const onSelect = vi.fn();
    render(
      <MovieSearchResult
        movie={nomination.movie}
        onQuickAdd={onQuickAdd}
        onSelect={onSelect}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Add A Movie to this list" }),
    );

    expect(onQuickAdd).toHaveBeenCalledWith(nomination.movie);
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("status", { name: "Adding movie..." }).className,
    ).toBe(loadingStyles.inline);
    expect(
      screen.queryByRole("button", { name: "Add A Movie to this list" }),
    ).toBeNull();

    await act(async () => {
      finishAdding();
      await pendingAdd;
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add A Movie to this list" }),
    ).toBeTruthy();
  });

  it("renders a movie card and expands it on click", () => {
    const onToggleDiscussion = vi.fn();

    render(
      <MovieCard
        nomination={nomination}
        rank={1}
        hasSeen
        showMeta
        isExpanded={false}
        onClick={onToggleDiscussion}
        onLongPress={vi.fn()}
      />,
    );

    expect(screen.getByText("A Movie")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Watched" })).toBeTruthy();
    expect(screen.getByAltText("").parentElement?.className).not.toContain(
      "watchedPoster",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand details for A Movie" }),
    );
    expect(onToggleDiscussion).toHaveBeenCalledOnce();
  });

  it.each([
    { hasSeen: false, isCompleted: false, watched: false },
    { hasSeen: true, isCompleted: false, watched: true },
    { hasSeen: false, isCompleted: true, watched: true },
    { hasSeen: true, isCompleted: true, watched: true },
  ])(
    "shows the watched badge when seen=$hasSeen and completed=$isCompleted",
    ({ hasSeen, isCompleted, watched }) => {
      render(
        <MovieCard
          nomination={nomination}
          rank={1}
          hasSeen={hasSeen}
          isCompleted={isCompleted}
          showMeta={false}
          isExpanded={false}
          onClick={vi.fn()}
          onLongPress={vi.fn()}
        />,
      );

      expect(screen.queryAllByRole("img", { name: "Watched" })).toHaveLength(
        watched ? 1 : 0,
      );
    },
  );

  it("keeps the watched badge and comparison selector on a missing poster", () => {
    const onClick = vi.fn();
    render(
      <MovieCard
        nomination={{
          ...nomination,
          movie: {
            ...nomination.movie,
            details: { ...nomination.movie.details, posterUrl: null },
          },
        }}
        rank={1}
        hasSeen
        showMeta={false}
        isExpanded={false}
        isSelected
        onClick={onClick}
        onLongPress={vi.fn()}
      />,
    );

    const badge = screen.getByRole("img", { name: "Watched" });
    expect(badge.nextElementSibling?.className).toContain("selectMark");
    expect(screen.getByText("A")).toBeTruthy();
    const button = screen.getByRole("button", {
      name: "Select A Movie to compare",
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("marks an expanded card without adding an undefined class", () => {
    const { container } = render(
      <MovieCard
        nomination={nomination}
        rank={1}
        hasSeen={false}
        showMeta
        isExpanded
        onClick={vi.fn()}
        onLongPress={vi.fn()}
      />,
    );

    expect(container.querySelector("article")?.className).toContain(
      "activeCard",
    );
    expect(container.querySelector("article")?.className).not.toContain(
      "undefined",
    );
  });

  it("expands the search bar over the sort and filter toggles", async () => {
    render(
      <ViewControls
        state={{ sort: "newest", filters: [] }}
        onChange={vi.fn()}
        existing={new Set()}
        isSubmitting={false}
        onNominate={vi.fn()}
      />,
    );

    const search = screen.getByRole("textbox", {
      name: "Search for a movie to add",
    });
    expect(screen.getByRole("button", { name: "Sort by" })).toBeTruthy();

    act(() => search.focus());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Sort by" })).toBeNull(),
    );

    const closeSearch = screen.getByRole("button", { name: "Close search" });
    expect(closeSearch.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 16 16",
    );
    fireEvent.click(closeSearch);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sort by" })).toBeTruthy(),
    );
  });

  it("keeps bulk import out of the top list controls", () => {
    render(
      <ViewControls
        state={{ sort: "newest", filters: [] }}
        onChange={vi.fn()}
        existing={new Set()}
        isSubmitting={false}
        onNominate={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Import movies" })).toBeNull();
  });

  it("submits a nomination comment", () => {
    const onSubmit = vi.fn();

    render(
      <NominationForm
        candidate={nomination.movie}
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Why should we watch it?" }),
      { target: { value: "So good" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /Add movie/ }));
    expect(onSubmit).toHaveBeenCalledWith("So good");
  });

  it("lets the current user edit their nomination comment", async () => {
    const onUpdateComment = vi.fn().mockResolvedValue(true);

    render(
      <MovieDiscussion
        nomination={nomination}
        hasSeen={false}
        currentUserId="user"
        onUpdateComment={onUpdateComment}
        onMarkWatched={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("A description")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit A Movie nomination comment",
      }),
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: "Nomination comment for A Movie",
      }),
      { target: { value: "A sharper pitch" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onUpdateComment).toHaveBeenCalledWith("A sharper pitch"),
    );
  });
});
