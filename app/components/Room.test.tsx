// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Room, type RoomAPI } from "./Room";
import type { Nomination } from "@/src/db/schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/[ownerId]/[slug]/RoomContext", () => ({
  useRoom: () => ({ room: { id: "room", name: "Watchlist" }, isAdmin: true }),
}));
vi.mock("./ShortlistHeader", () => ({
  ShortlistHeader: ({ onBulkJustWatch }: { onBulkJustWatch?: () => void }) => (
    <header>
      Shortlist
      {onBulkJustWatch && (
        <button type="button" onClick={onBulkJustWatch}>Bulk add JustWatch</button>
      )}
    </header>
  ),
}));
vi.mock("./ViewControls", () => ({
  ViewControls: () => <div>List controls</div>,
}));
vi.mock("./MovieCard", () => ({
  MovieCard: ({ nomination }: { nomination: Nomination }) => (
    <article>{nomination.movie.details.title}</article>
  ),
}));

afterEach(cleanup);

const watched: Nomination = {
  id: 1,
  roomId: "room",
  userId: "user",
  movieId: 1,
  comment: null,
  completed: true,
  createdAt: new Date(),
  movie: {
    id: 1,
    tmdbId: 123,
    createdAt: new Date(),
    details: { title: "Watched movie" } as Nomination["movie"]["details"],
    ratings: { raw: {}, services: [] },
  },
  nomcoms: [],
  nominator: { id: "user", name: "User", email: "user@example.com" },
  seenBy: [],
};

const createApi = (): RoomAPI => ({
  refreshJustWatch: vi.fn(),
  importTitle: vi.fn().mockResolvedValue({
    status: "added",
    movie: { id: 2, title: "Arrival", year: 2016 },
  }),
  delete: vi.fn(),
  nominate: vi.fn(),
  updateNomRec: vi.fn(),
  toggleWatched: vi.fn(),
  toggleCompleted: vi.fn(),
});

function show(nominees: Nomination[], api = createApi()) {
  return render(
    <Room
      userId="user"
      api={api}
      nominees={nominees}
      viewState={{ sort: "newest", filters: [] }}
      setViewState={vi.fn()}
      viewContext={{ userId: "user" }}
    />,
  );
}

describe("room bulk import placement", () => {
  it("refreshes watched movies from the menu and shows progress", async () => {
    const api = createApi();
    vi.mocked(api.refreshJustWatch).mockResolvedValue({
      country: "US", checkedAt: new Date().toISOString(),
      status: "matched", offers: [], url: null,
    });
    show([watched], api);
    fireEvent.click(screen.getByRole("button", { name: "Bulk add JustWatch" }));
    await waitFor(() => expect(api.refreshJustWatch).toHaveBeenCalledWith(watched.movieId));
    await waitFor(() =>
      expect(screen.getByText("JustWatch update complete. 1 of 1 processed. 1 updated.")).toBeTruthy(),
    );
  });

  it("places import after Watched whether collapsed or expanded", () => {
    show([watched]);
    const importButton = screen.getByRole("button", { name: "Import movies" });
    const watchedToggle = screen.getByRole("button", { name: /Watched/ });
    expect(watchedToggle.compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(watchedToggle);
    expect(screen.getByText("Watched movie").compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(importButton.closest("main")?.lastElementChild?.contains(importButton)).toBe(true);
  });

  it("still imports from the bottom of an empty list", async () => {
    const api = createApi();
    show([], api);
    const importButton = screen.getByRole("button", { name: "Import movies" });
    expect(screen.getByText("Nothing here yet. Add the first movie.").compareDocumentPosition(importButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(importButton);
    fireEvent.change(screen.getByRole("textbox", { name: "Movie titles" }), {
      target: { value: "Arrival" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import 1 movie" }));
    await waitFor(() => expect(api.importTitle).toHaveBeenCalledWith("Arrival"));
    await waitFor(() =>
      expect(screen.getByText("Import complete. 1 of 1 processed. 1 added.")).toBeTruthy(),
    );
  });
});
