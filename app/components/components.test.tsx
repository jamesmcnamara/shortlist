// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MovieCard } from "@/app/components/MovieCard";
import { MovieDiscussion } from "@/app/components/MovieDiscussion/MovieDiscussion";
import { NominationPanel } from "@/app/components/NominationPanel";
import type { MovieDetails, Nomination } from "@/src/db/schema";

const nomination: Nomination = {
  id: 1,
  roomId: "room",
  userId: "user",
  movieId: 1,
  comment: "A recommendation",
  cycle: 0,
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
  votes: [],
  nomcoms: [],
  nominator: { id: "user", name: "Alice", email: "alice@example.com" },
  seenBy: [],
};

describe("high-churn component smoke tests", () => {
  it("renders a movie card and exposes its vote interaction", () => {
    const onAddVote = vi.fn();
    const onToggleDiscussion = vi.fn();

    render(
      <MovieCard
        nomination={nomination}
        rank={1}
        hasSeen
        hasUpvoted={false}
        canVote
        isExpanded={false}
        onAddVote={onAddVote}
        onToggleDiscussion={onToggleDiscussion}
      />,
    );

    expect(screen.getByText("A Movie")).toBeTruthy();
    expect(screen.getByAltText("").parentElement?.className).toContain(
      "watchedPoster",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Give a vote to A Movie" }),
    );
    expect(onAddVote).toHaveBeenCalledOnce();
  });

  it("renders the nomination panel and closes it", () => {
    const onClose = vi.fn();

    render(
      <NominationPanel
        currentNomination={null}
        isSubmitting={false}
        roomType="club"
        existing={new Set()}
        onClose={onClose}
        onSubmit={vi.fn()}
        onRescind={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Nominate a movie" }),
    ).toBeTruthy();
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
        hasUpvoted={false}
        canVote
        currentUserId="user"
        onAddVote={vi.fn()}
        onRemoveVote={vi.fn()}
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
