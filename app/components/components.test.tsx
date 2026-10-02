// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { NominationPanel } from "@/app/components/NominationPanel";
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

  it("renders the nomination panel and closes it", () => {
    const onClose = vi.fn();

    render(
      <NominationPanel
        isSubmitting={false}
        existing={new Set()}
        onClose={onClose}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Add a movie" })).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Close nomination panel" }),
    );
    expect(onClose).toHaveBeenCalledOnce();
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
