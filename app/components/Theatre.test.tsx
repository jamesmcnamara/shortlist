// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Theatre, type TheatreAPI } from "./Theatre";
import type { Nomination } from "@/src/db/schema";
import type { AppMenuProps } from "./AppMenu";
import type { MovieImportResult } from "@/app/lib/bulk-movie-import";

const { push, celebrate } = vi.hoisted(() => ({
  push: vi.fn(),
  celebrate: vi.fn(),
}));
vi.mock("@/app/lib/useConfetti", () => ({
  useConfetti: () => celebrate,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));
vi.mock("@/app/components/CrossPost/CrossPost", () => ({
  CrossPost: ({
    films,
    onPosted,
    onClose,
  }: {
    films: Nomination[];
    onPosted: (summary: { films: number; lists: number }) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label="Post to other lists">
      {films.map((film) => film.movie.details.title).join(", ")}
      <button
        onClick={() => {
          onPosted({ films: films.length, lists: 2 });
          onClose();
        }}
      >
        Fake post
      </button>
    </div>
  ),
}));
vi.mock("./ShortlistHeader", () => ({
  ShortlistHeader: ({ additionalMenuItems = [] }: AppMenuProps) => (
    <header>
      Shortlist
      {additionalMenuItems.map((item) =>
        item.type === "button" ? (
          <button key={item.label} onClick={item.onClick}>
            {item.label}
          </button>
        ) : null,
      )}
    </header>
  ),
}));
vi.mock("./ViewControls", () => ({
  ViewControls: () => <div>List controls</div>,
}));
vi.mock("./MovieCard", () => ({
  MovieCard: ({
    nomination,
    onClick,
    onLongPress,
  }: {
    nomination: Nomination;
    onClick: () => void;
    onLongPress: () => void;
  }) => (
    <article onClick={onClick} onContextMenu={onLongPress}>
      {nomination.movie.details.title}
    </article>
  ),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  cleanup();
  push.mockClear();
  celebrate.mockClear();
});

const watched: Nomination = {
  id: 1,
  theatreId: "theatre",
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
  nominator: { id: "user", name: "User" },
  seenBy: [],
};

const createApi = (): TheatreAPI => ({
  refreshJustWatch: vi.fn(),
  refreshBoxOffice: vi.fn(),
  importTitle: vi.fn().mockResolvedValue({
    status: "added",
    movie: { id: 2, title: "Arrival", year: 2016 },
  }),
  delete: vi.fn(),
  nominate: vi.fn(),
  updateNomRec: vi.fn(),
  addNomCom: vi.fn(),
  updateNomCom: vi.fn(),
  toggleWatched: vi.fn(),
  markWatched: vi.fn().mockResolvedValue(undefined),
  toggleCompleted: vi.fn(),
});

function show(nominees: Nomination[], api: TheatreAPI | null = createApi()) {
  return render(
    <Theatre
      theatreId="theatre"
      name="Watchlist"
      header={{}}
      isAdmin
      userId="user"
      api={api ?? undefined}
      nominees={nominees}
      viewState={{ sort: "newest", filters: [] }}
      setViewState={vi.fn()}
      viewContext={{ userId: "user" }}
    />,
  );
}

describe("theatre movie animations", () => {
  it("renders active movies immediately and keeps completed movies collapsed", () => {
    show([watched, { ...watched, id: 2, completed: false }]);
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toBe("Watched movie");
    expect(cards[0].parentElement?.style.opacity).toBe("1");
    expect(
      screen
        .getByRole("button", { name: /Watched/ })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });

  it("celebrates marking a movie seen only after a successful save", async () => {
    const api = createApi();
    const save = Promise.withResolvers<void>();
    vi.mocked(api.toggleWatched).mockReturnValue(save.promise);
    show([{ ...watched, completed: false }], api);

    fireEvent.click(screen.getByText("Watched movie"));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Watched movie as seen" }),
    );
    expect(api.toggleWatched).toHaveBeenCalledWith(watched.movieId);
    expect(celebrate).not.toHaveBeenCalled();

    save.resolve();
    await waitFor(() => expect(celebrate).toHaveBeenCalledOnce());
  });

  it("does not celebrate unmarking a movie seen", async () => {
    const api = createApi();
    show(
      [{
        ...watched,
        completed: false,
        seenBy: [{ id: "user", name: "User" }],
      }],
      api,
    );
    fireEvent.click(screen.getByText("Watched movie"));
    fireEvent.click(
      screen.getByRole("button", { name: "Unmark Watched movie as seen" }),
    );
    await waitFor(() =>
      expect(api.toggleWatched).toHaveBeenCalledWith(watched.movieId),
    );
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("celebrates moving a movie into Watched", async () => {
    const api = createApi();
    show([{ ...watched, completed: false }], api);
    fireEvent.click(screen.getByText("Watched movie"));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Watched movie as Watched" }),
    );
    await waitFor(() => expect(celebrate).toHaveBeenCalledOnce());
    expect(api.toggleCompleted).toHaveBeenCalledWith(watched.id);
  });

  it("does not celebrate moving a movie out of Watched", async () => {
    const api = createApi();
    show([watched], api);
    fireEvent.click(screen.getByRole("button", { name: /Watched/ }));
    fireEvent.click(screen.getByText("Watched movie"));
    fireEvent.click(
      screen.getByRole("button", { name: "Move Watched movie out of Watched" }),
    );
    await waitFor(() =>
      expect(api.toggleCompleted).toHaveBeenCalledWith(watched.id),
    );
    expect(celebrate).not.toHaveBeenCalled();
  });

  it.each(["toggleWatched", "toggleCompleted"] as const)(
    "does not celebrate a failed %s action",
    async (action) => {
      const api = createApi();
      vi.mocked(api[action]).mockRejectedValue(new Error("Save failed"));
      show([{ ...watched, completed: false }], api);
      fireEvent.click(screen.getByText("Watched movie"));
      fireEvent.click(
        screen.getByRole("button", {
          name:
            action === "toggleWatched"
              ? "Mark Watched movie as seen"
              : "Mark Watched movie as Watched",
        }),
      );
      await waitFor(() => expect(screen.getByText("Save failed")).toBeTruthy());
      expect(celebrate).not.toHaveBeenCalled();
      expect(
        screen.getByRole("region", { name: "Discussion about Watched movie" }),
      ).toBeTruthy();
    },
  );
});

describe("theatre bulk import panel", () => {
  const openImport = () =>
    fireEvent.click(screen.getByRole("button", { name: "Import Movies" }));

  it("opens from the menu and places the panel after Watched", () => {
    show([watched]);
    expect(screen.queryByRole("textbox", { name: "Movie titles" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import movies" })).toBeNull();
    openImport();
    const panel = screen.getByRole("region", { name: "Movie titles" });
    const watchedToggle = screen.getByRole("button", { name: /Watched/ });
    expect(
      watchedToggle.compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(watchedToggle);
    expect(
      screen.getByText("Watched movie").compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      panel.closest("main")?.lastElementChild?.contains(panel),
    ).toBe(true);
  });

  it("opens and imports on an empty list", async () => {
    const api = createApi();
    show([], api);
    openImport();
    const panel = screen.getByRole("region", { name: "Movie titles" });
    expect(
      screen
        .getByText("Nothing here yet. Add the first movie.")
        .compareDocumentPosition(panel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Movie titles" }), {
      target: { value: "Arrival" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import 1 movie" }));
    await waitFor(() =>
      expect(api.importTitle).toHaveBeenCalledWith("Arrival"),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Import complete. 1 of 1 processed. 1 added."),
      ).toBeTruthy(),
    );
  });

  it("closes the panel and can reopen it from the menu", () => {
    show([]);
    openImport();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Movie titles" })).toBeNull();
    openImport();
    expect(screen.getByRole("textbox", { name: "Movie titles" })).toBeTruthy();
  });

  it("stops requesting more titles when the running panel is closed", async () => {
    const api = createApi();
    const first = Promise.withResolvers<MovieImportResult>();
    vi.mocked(api.importTitle).mockReturnValue(first.promise);
    show([], api);
    openImport();
    fireEvent.change(screen.getByRole("textbox", { name: "Movie titles" }), {
      target: { value: "Arrival\nHeat" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import 2 movies" }));
    expect(api.importTitle).toHaveBeenCalledWith("Arrival");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Movie titles" })).toBeNull();
    await act(async () => first.resolve({
      status: "added",
      movie: { id: 2, title: "Arrival", year: 2016 },
    }));
    expect(api.importTitle).toHaveBeenCalledTimes(1);
  });
});

describe("read-only theatre", () => {
  it("shows the list but hides every way to change it", () => {
    show([watched, { ...watched, id: 2, completed: false }], null);
    expect(screen.getByText("Watchlist")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Import movies/i })).toBeNull();
    expect(screen.queryByRole("region", { name: "Movie titles" })).toBeNull();
  });
});

describe("picked movie actions", () => {
  const film = (id: number, title: string): Nomination => ({
    ...watched,
    id,
    movieId: id,
    completed: false,
    movie: {
      ...watched.movie,
      id,
      tmdbId: id * 100,
      details: { title } as Nomination["movie"]["details"],
    },
  });
  const arrival = film(10, "Arrival");
  const heat = film(11, "Heat");
  const compare = () => screen.getByRole("button", { name: "Compare" });
  const more = () => screen.getByRole("button", { name: "More actions" });

  it("opens the menu from the arrow with one film, but won't compare one", () => {
    show([arrival, heat]);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    expect(compare().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(compare());
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(more());
    expect(more().getAttribute("aria-expanded")).toBe("true");
    expect(
      screen.getByRole("menuitem", { name: "Post to other lists…" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Mark watched" })).toBeTruthy();
  });

  it("opens the menu on a long press of Compare without comparing", () => {
    show([arrival, heat]);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.click(screen.getByText("Heat"));
    fireEvent.contextMenu(compare());
    fireEvent.click(compare());
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(compare());
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("marks every picked film watched and stops picking", async () => {
    const api = createApi();
    show([arrival, heat], api);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.click(screen.getByText("Heat"));
    fireEvent.click(more());
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark watched" }));
    await waitFor(() => expect(api.markWatched).toHaveBeenCalledWith([10, 11]));
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Compare movies" }),
      ).toBeNull(),
    );
    expect(celebrate).toHaveBeenCalledOnce();
  });

  it("does not celebrate bulk marking movies that were already seen", async () => {
    const api = createApi();
    show([{ ...arrival, seenBy: [{ id: "user", name: "User" }] }], api);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.click(more());
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark watched" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Compare movies" })).toBeNull(),
    );
    expect(api.markWatched).toHaveBeenCalledWith([10]);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("does not celebrate a failed bulk watched save", async () => {
    const api = createApi();
    vi.mocked(api.markWatched).mockRejectedValue(new Error("Save failed"));
    show([arrival], api);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.click(more());
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark watched" }));
    await waitFor(() => expect(screen.getByText("Save failed")).toBeTruthy());
    expect(celebrate).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Compare movies" })).toBeTruthy();
  });

  it("cross-posts the picked films and reports what was posted", async () => {
    show([arrival, heat]);
    fireEvent.contextMenu(screen.getByText("Heat"));
    fireEvent.click(more());
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Post to other lists…" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Post to other lists" });
    expect(sheet.textContent).toContain("Heat");
    expect(sheet.textContent).not.toContain("Arrival");
    fireEvent.click(screen.getByRole("button", { name: "Fake post" }));
    await waitFor(() =>
      expect(screen.getByText("Posted 1 film to 2 lists.")).toBeTruthy(),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Compare movies" }),
      ).toBeNull(),
    );
  });

  it("keeps read-only theatres to a plain Compare", () => {
    show([arrival, heat], null);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.contextMenu(compare());
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
