// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  theatreId: "theatre",
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
  nominator: { id: "user", name: "Alice" },
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

    expect(screen.queryByRole("status", { name: "Adding movie..." })).toBeNull();
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

    expect(screen.queryByRole("status", { name: "Adding movie..." })).toBeNull();
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
    expect(screen.getByAltText("").parentElement?.className).toContain(
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

  it.each([
    ["Net return", "box-office-net"],
    ["Return multiplier", "box-office-multiplier"],
  ])("selects the %s box-office sort", (label, sort) => {
    const onChange = vi.fn();
    render(
      <ViewControls
        state={{ sort: "recent", filters: ["mine"] }}
        onChange={onChange}
        existing={new Set()}
        isSubmitting={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(onChange).toHaveBeenCalledWith({ sort, filters: ["mine"] });
    expect(
      screen.getByRole("button", { name: "Sort by" }).getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("opens and closes the sort and filter option panels", async () => {
    render(
      <ViewControls
        state={{ sort: "newest", filters: [] }}
        onChange={vi.fn()}
        existing={new Set()}
        isSubmitting={false}
        onNominate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
    expect(screen.getByRole("group", { name: "Sort by" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Sort by" })).toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    expect(screen.getByRole("group", { name: "Filters" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Filters" })).toBeNull(),
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

  it.each([nomination.movie.details.posterUrl, null])(
    "renders the discussion title beside the poster or placeholder (%s)",
    (posterUrl) => {
      const title = "A Very Long Movie Title That Needs Room to Wrap";
      render(
        <MovieDiscussion
          nomination={{
            ...nomination,
            movie: {
              ...nomination.movie,
              details: { ...nomination.movie.details, title, posterUrl },
            },
          }}
          hasSeen={false}
          currentUserId="user"
          onClose={vi.fn()}
        />,
      );

      const heading = screen.getByRole("heading", { name: title });
      const poster = heading.parentElement?.previousElementSibling;
      expect(poster).toBeTruthy();
      if (posterUrl) {
        expect(poster?.getAttribute("src")).toBe(posterUrl);
        expect(poster?.getAttribute("alt")).toBe("");
      } else {
        expect(poster?.tagName).toBe("DIV");
        expect(poster?.getAttribute("aria-hidden")).toBe("true");
      }
      expect(screen.getByText("Nominated by Alice").parentElement).toBe(
        heading.parentElement,
      );
      expect(screen.getByText("A description").parentElement).not.toBe(
        heading.parentElement,
      );
    },
  );

  it.each([false, true])(
    "keeps the admin completion toggle beside runtime when completed=%s",
    (completed) => {
      const onToggleCompleted = vi.fn();
      const onMarkWatched = vi.fn();
      const onDelete = vi.fn();
      const onClose = vi.fn();
      render(
        <MovieDiscussion
          nomination={{
            ...nomination,
            completed,
            movie: {
              ...nomination.movie,
              details: { ...nomination.movie.details, runtime: 123 },
            },
          }}
          hasSeen={false}
          currentUserId="user"
          onToggleCompleted={onToggleCompleted}
          onMarkWatched={onMarkWatched}
          onDelete={onDelete}
          onClose={onClose}
        />,
      );

      const runtimeRow = screen.getByText("2025 • 2h 3m").parentElement!;
      const toggle = within(runtimeRow).getByRole("button", {
        name: completed
          ? "Move A Movie out of Watched"
          : "Mark A Movie as Watched",
      });
      expect(toggle.textContent).toBe(completed ? "Completed ✓" : "Watched");
      expect(toggle.getAttribute("aria-pressed")).toBe(String(completed));
      fireEvent.click(toggle);
      expect(onToggleCompleted).toHaveBeenCalledTimes(1);
      expect(onMarkWatched).not.toHaveBeenCalled();

      if (!completed) {
        const seen = screen.getByRole("button", { name: "Mark A Movie as seen" });
        expect(runtimeRow.contains(seen)).toBe(false);
        fireEvent.click(seen);
        expect(onMarkWatched).toHaveBeenCalledTimes(1);
        fireEvent.click(
          screen.getByRole("button", {
            name: "Delete A Movie from the watchlist",
          }),
        );
        expect(onDelete).toHaveBeenCalledTimes(1);
      } else {
        expect(screen.queryByRole("button", { name: /as seen/ })).toBeNull();
        expect(screen.queryByRole("button", { name: /Delete A Movie/ })).toBeNull();
      }
      fireEvent.click(screen.getByRole("button", { name: "Close discussion" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    },
  );

  it("omits the admin completion toggle without its callback", () => {
    render(
      <MovieDiscussion
        nomination={nomination}
        hasSeen={false}
        currentUserId="user"
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /as Watched/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /out of Watched/ })).toBeNull();
  });

  it("lets the current user edit their nomination comment", async () => {
    const onUpdateComment = vi.fn().mockResolvedValue(true);

    render(
      <MovieDiscussion
        nomination={nomination}
        hasSeen={false}
        currentUserId="user"
        onUpdateComment={onUpdateComment}
        onAddNomCom={vi.fn()}
        onUpdateNomCom={vi.fn()}
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

  it("renders NomComs and supports adding and editing them", async () => {
    const onAddNomCom = vi.fn().mockResolvedValue(true);
    const onUpdateNomCom = vi.fn().mockResolvedValue(true);
    render(
      <MovieDiscussion
        nomination={{
          ...nomination,
          nomcoms: [
            {
              id: 7,
              theatreId: "theatre",
              userId: "user",
              nominationId: nomination.id,
              comment: "I agree",
              createdAt: new Date(),
              commenter: {
                id: "user",
                name: "Alice",
              },
            },
          ],
        }}
        hasSeen={false}
        currentUserId="user"
        onUpdateComment={vi.fn()}
        onAddNomCom={onAddNomCom}
        onUpdateNomCom={onUpdateNomCom}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Nom Coms")).toBeTruthy();
    expect(screen.getByText("I agree")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Add a comment" }), {
      target: { value: "Count me in" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(onAddNomCom).toHaveBeenCalledWith("Count me in"));

    fireEvent.click(
      screen.getByRole("button", { name: "Edit Alice's comment" }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Comment from Alice" }), {
      target: { value: "I still agree" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(onUpdateNomCom).toHaveBeenCalledWith(7, "I still agree"),
    );
  });
});
