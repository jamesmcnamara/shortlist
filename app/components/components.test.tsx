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
  it("renders an accessible loading overlay", () => {
    render(<LoadingOverlay label="Searching movies..." />);

    expect(
      screen.getByRole("status", { name: "Searching movies..." }),
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
    expect(screen.getByAltText("").parentElement?.className).toContain(
      "watchedPoster",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Expand details for A Movie" }),
    );
    expect(onToggleDiscussion).toHaveBeenCalledOnce();
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

    expect(container.querySelector("article")?.className).toContain("activeCard");
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

    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sort by" })).toBeTruthy(),
    );
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
    const onUpdateNominationComment = vi.fn().mockResolvedValue(true);

    render(
      <MovieDiscussion
        nomination={nomination}
        hasSeen={false}
        currentUserId="user"
        onAddComment={vi.fn()}
        onUpdateNominationComment={onUpdateNominationComment}
        onUpdateComment={vi.fn()}
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
      expect(onUpdateNominationComment).toHaveBeenCalledWith("A sharper pitch"),
    );
  });
});
