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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Theatre, type TheatreAPI } from "./Theatre";
import type { Nomination, Person } from "@/src/db/schema";
import type { ShortlistHeaderProps } from "./ShortlistHeader";
import type { MovieImportResult } from "@/app/lib/bulk-movie-import";
import { VOTES_SORT } from "@/app/lib/extensions/movieclub/view";
import type { SortOption, ViewState } from "@/app/lib/view";

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
  ShortlistHeader: ({
    additionalMenuItems = [],
    children,
  }: ShortlistHeaderProps) => (
    <header>
      Shortlist
      {children}
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
  ViewControls: ({
    onNominate,
    additionalSorts,
  }: {
    onNominate?: (movie: { id: number }, comment: string) => void;
    additionalSorts?: readonly { id: string }[];
  }) => (
    <div>
      List controls
      {additionalSorts && (
        <output aria-label="Sorts">
          {additionalSorts.map(({ id }) => id).join(",")}
        </output>
      )}
      {onNominate && (
        <button onClick={() => onNominate({ id: 1 }, "")}>
          Add nomination
        </button>
      )}
    </div>
  ),
}));
vi.mock("./Fantasy/FantasyDashboard", () => ({
  FantasyDashboard: ({ nominees }: { nominees: Nomination[] }) => (
    <section aria-label="Fantasy dashboard">{nominees.length} movies</section>
  ),
}));
vi.mock("./NotificationBell", () => ({
  NotificationBell: ({ theatreId }: { theatreId: string }) => (
    <button aria-label="List notifications" data-theatre-id={theatreId} />
  ),
}));
vi.mock("./MovieCard", () => ({
  MovieCard: ({
    nomination,
    showMeta,
    footer,
    onClick,
    onLongPress,
  }: {
    nomination: Nomination;
    showMeta: boolean;
    footer?: ReactNode;
    onClick: () => void;
    onLongPress: () => void;
  }) => (
    <article data-show-meta={showMeta}>
      <span onClick={onClick} onContextMenu={onLongPress}>
        {nomination.movie.details.title}
      </span>
      {footer}
    </article>
  ),
}));
vi.mock("./Suggestions", () => ({
  Suggestions: ({
    existing,
    onSuggest,
    onNominate,
  }: {
    existing: Set<number>;
    onSuggest: (exclude: string[]) => Promise<unknown>;
    onNominate: (movie: { id: number }, comment: string) => Promise<void>;
  }) => (
    <section aria-label="Suggestions">
      <output aria-label="On the list">{[...existing].join(",")}</output>
      <button onClick={() => onSuggest(["Heat"])}>Fake suggest</button>
      <button onClick={() => onNominate({ id: 5 }, "Because")}>Fake add</button>
    </section>
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
  completedAt: new Date(),
  createdAt: new Date(),
  movie: {
    id: 1,
    tmdbId: 123,
    createdAt: new Date(),
    details: { title: "Watched movie" } as Nomination["movie"]["details"],
    ratings: { raw: {}, services: [] },
  },
  nomcoms: [],
  nominator: { id: "user", name: "User", username: "user" },
  seenBy: [],
};

const createApi = (): TheatreAPI => ({
  updateDescription: vi.fn().mockResolvedValue(undefined),
  saveBudget: vi.fn(),
  importTitle: vi.fn().mockResolvedValue({
    status: "added",
    movie: { id: 2, title: "Arrival", year: 2016 },
  }),
  suggest: vi.fn().mockResolvedValue([]),
  delete: vi.fn(),
  nominate: vi.fn(),
  updateNomRec: vi.fn(),
  addNomCom: vi.fn(),
  updateNomCom: vi.fn(),
  toggleWatched: vi.fn(),
  markWatched: vi.fn().mockResolvedValue(undefined),
  toggleCompleted: vi.fn(),
  vote: vi.fn(),
});

function show(
  nominees: Nomination[],
  api: TheatreAPI | null = createApi(),
  isAdmin = true,
  userId: string | null = "user",
  description: string | null = null,
  isMember = false,
  additionalSorts?: readonly SortOption[],
  viewState: ViewState = { sort: "newest", filters: [] },
) {
  return render(
    <Theatre
      theatreId="theatre"
      name="Watchlist"
      description={description}
      header={{}}
      isAdmin={isAdmin}
      isMember={isMember}
      userId={userId ?? undefined}
      api={api ?? undefined}
      nominees={nominees}
      viewState={viewState}
      additionalSorts={additionalSorts}
      setViewState={vi.fn()}
      viewContext={{ userId: userId ?? undefined }}
    />,
  );
}

describe("list notification placement", () => {
  it("shows a bell in the title row for members, including non-admins", () => {
    show([], createApi(), false, "user", null, true);
    const bell = screen.getByRole("button", { name: "List notifications" });
    expect(bell.getAttribute("data-theatre-id")).toBe("theatre");
    expect(bell.parentElement).toBe(
      screen.getByRole("heading", { name: "Watchlist" }).parentElement,
    );
  });

  it("hides the bell for non-members", () => {
    show([], createApi(), false);
    expect(
      screen.queryByRole("button", { name: "List notifications" }),
    ).toBeNull();
  });

  it("hides the bell for signed-out visitors", () => {
    show([], null, false, null, null, true);
    expect(
      screen.queryByRole("button", { name: "List notifications" }),
    ).toBeNull();
  });
});

describe("list descriptions", () => {
  it("shows the description before the list controls with an admin edit action", () => {
    show([], createApi(), true, "user", "Our #Horror movies");
    const description = screen.getByText("#Horror");
    expect(description.parentElement?.textContent).toBe("Our #Horror movies");
    expect(
      description.compareDocumentPosition(screen.getByText("List controls")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Edit list description" }),
    ).toBeTruthy();
  });

  it("lets admins save a trimmed description and closes the editor", async () => {
    const api = createApi();
    show([], api);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit list description" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "List description" }),
      {
        target: { value: "  Our #Horror films  " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updateDescription).toHaveBeenCalledWith("Our #Horror films"),
    );
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("allows clearing a description", async () => {
    const api = createApi();
    show([], api, true, "user", "#Horror");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit list description" }),
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateDescription).toHaveBeenCalledWith(""));
  });

  it("cancels without saving and resets the draft on the next edit", () => {
    const api = createApi();
    show([], api, true, "user", "#Horror");
    fireEvent.click(
      screen.getByRole("button", { name: "Edit list description" }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#Comedy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.updateDescription).not.toHaveBeenCalled();
    expect(screen.getByText("#Horror")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Edit list description" }),
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "#Horror",
    );
  });

  it("keeps failed drafts editable and shows the error for retry", async () => {
    const api = createApi();
    vi.mocked(api.updateDescription).mockRejectedValueOnce(
      new Error("Could not save description."),
    );
    show([], api);
    fireEvent.click(
      screen.getByRole("button", { name: "Edit list description" }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "#Horror" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Could not save description.");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "#Horror",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it.each([
    ["member", false],
    [null, false],
    [null, true],
  ] as const)(
    "lets %s read descriptions without editing (admin=%s)",
    (userId, isAdmin) => {
      show([], createApi(), isAdmin, userId, "Our #Horror movies");
      expect(screen.getByText("#Horror").parentElement?.textContent).toBe(
        "Our #Horror movies",
      );
      expect(
        screen.queryByRole("button", { name: "Edit list description" }),
      ).toBeNull();
    },
  );

  it("hides empty descriptions from read-only viewers", () => {
    show([], null, false, null);
    expect(screen.queryByText("Add a description and #tags.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit list description" }),
    ).toBeNull();
  });
});

describe("theatre movie animations", () => {
  it("lets signed-in non-admins participate without showing curation controls", () => {
    const api = createApi();
    show([{ ...watched, completedAt: null }], api, false);
    expect(screen.queryByRole("button", { name: "Add nomination" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import Movies" })).toBeNull();

    fireEvent.click(screen.getByText("Watched movie"));
    expect(
      screen.getByRole("button", { name: "Mark Watched movie as seen" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Mark .* as Watched/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Post comment" })).toBeTruthy();
  });

  it("keeps signed-out viewers read-only while leaving the list browsable", () => {
    show([{ ...watched, completedAt: null }], createApi(), false, null);
    expect(screen.getByText("Watched movie")).toBeTruthy();
    fireEvent.click(screen.getByText("Watched movie"));
    expect(
      screen.queryByRole("button", { name: "Mark Watched movie as seen" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Post comment" })).toBeNull();
  });

  it("does not let an admin edit another nominator's recommendation", () => {
    show([
      {
        ...watched,
        completedAt: null,
        userId: "original",
        nominator: { id: "original", name: "Original", username: "original" },
      },
    ]);
    fireEvent.click(screen.getByText("Watched movie"));
    expect(
      screen.queryByRole("button", {
        name: "Edit Watched movie nomination comment",
      }),
    ).toBeNull();
  });

  it("renders active movies immediately and keeps completed movies collapsed", () => {
    show([watched, { ...watched, id: 2, completedAt: null }]);
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

  it("celebrates marking a movie seen immediately without waiting for the save", async () => {
    const api = createApi();
    const save = Promise.withResolvers<void>();
    vi.mocked(api.toggleWatched).mockReturnValue(save.promise);
    show([{ ...watched, completedAt: null }], api);

    fireEvent.click(screen.getByText("Watched movie"));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Watched movie as seen" }),
    );
    expect(api.toggleWatched).toHaveBeenCalledWith(watched.movieId);
    expect(celebrate).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "Mark Watched movie as seen" }),
    );
    expect(api.toggleWatched).toHaveBeenCalledOnce();
    expect(celebrate).toHaveBeenCalledOnce();

    await act(async () => save.resolve());
    expect(celebrate).toHaveBeenCalledOnce();
  });

  it("does not celebrate unmarking a movie seen", async () => {
    const api = createApi();
    show(
      [
        {
          ...watched,
          completedAt: null,
          seenBy: [{ id: "user", name: "User" }],
        },
      ],
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

  it("celebrates moving a movie into Watched before the save finishes", async () => {
    const api = createApi();
    const save = Promise.withResolvers<void>();
    vi.mocked(api.toggleCompleted).mockReturnValue(save.promise);
    show([{ ...watched, completedAt: null }], api);
    fireEvent.click(screen.getByText("Watched movie"));
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Watched movie as Watched" }),
    );
    expect(celebrate).toHaveBeenCalledOnce();
    expect(api.toggleCompleted).toHaveBeenCalledWith(watched.id);
    await act(async () => save.resolve());
    expect(celebrate).toHaveBeenCalledOnce();
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
    "still reports a failed %s action after celebrating immediately",
    async (action) => {
      const api = createApi();
      vi.mocked(api[action]).mockRejectedValue(new Error("Save failed"));
      show([{ ...watched, completedAt: null }], api);
      fireEvent.click(screen.getByText("Watched movie"));
      fireEvent.click(
        screen.getByRole("button", {
          name:
            action === "toggleWatched"
              ? "Mark Watched movie as seen"
              : "Mark Watched movie as Watched",
        }),
      );
      expect(celebrate).toHaveBeenCalledOnce();
      await waitFor(() => expect(screen.getByText("Save failed")).toBeTruthy());
      expect(celebrate).toHaveBeenCalledOnce();
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
    expect(panel.closest("main")?.lastElementChild?.contains(panel)).toBe(true);
  });

  it("opens and imports on an empty list", async () => {
    const api = createApi();
    show([], api);
    openImport();
    const panel = screen.getByRole("region", { name: "Movie titles" });
    expect(
      screen
        .getByText("Nothing here yet. Add the first movie.")
        .compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING,
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
    await act(async () =>
      first.resolve({
        status: "added",
        movie: { id: 2, title: "Arrival", year: 2016 },
      }),
    );
    expect(api.importTitle).toHaveBeenCalledTimes(1);
  });
});

describe("read-only theatre", () => {
  it("shows the list but hides every way to change it", () => {
    show([watched, { ...watched, id: 2, completedAt: null }], null);
    expect(screen.getByText("Watchlist")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Import movies/i })).toBeNull();
    expect(screen.queryByRole("region", { name: "Movie titles" })).toBeNull();
  });
});

describe("fantasy lists", () => {
  const dashboard = () =>
    screen.findByRole("region", { name: "Fantasy dashboard" });

  it("shows the dashboard below the movies when the description has #fantasy", async () => {
    show(
      [{ ...watched, completedAt: null }],
      createApi(),
      true,
      "user",
      "Oscars #Fantasy",
    );
    const region = await dashboard();
    expect(region.textContent).toBe("1 movies");
    expect(
      screen.getByRole("article").compareDocumentPosition(region) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is also there for read-only viewers", async () => {
    show([{ ...watched, completedAt: null }], null, false, null, "#fantasy");
    await dashboard();
  });

  it("stays away from ordinary lists", async () => {
    show(
      [{ ...watched, completedAt: null }],
      createApi(),
      true,
      "user",
      "Just movies #fantasyfootball",
    );
    await screen.findByRole("article");
    expect(
      screen.queryByRole("region", { name: "Fantasy dashboard" }),
    ).toBeNull();
  });
});

describe("suggestions on #specific lists", () => {
  const active: Nomination = {
    ...watched,
    id: 2,
    movieId: 2,
    completedAt: null,
    movie: {
      ...watched.movie,
      id: 2,
      tmdbId: 456,
      details: { title: "Active movie" } as Nomination["movie"]["details"],
    },
  };
  const suggestions = () =>
    screen.queryByRole("region", { name: "Suggestions" });
  const watchedToggle = () => screen.queryByRole("button", { name: /Watched/ });

  it("shows Suggestions after the list in place of Watched, hiding completed movies", () => {
    show(
      [watched, active],
      createApi(),
      true,
      "user",
      "Heists, very #Specific",
    );
    expect(
      screen
        .getByRole("heading", { name: "Watchlist" })
        .compareDocumentPosition(suggestions()!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(watchedToggle()).toBeNull();
    expect(screen.queryByText("Watched movie")).toBeNull();
    expect(screen.getByText("Active movie")).toBeTruthy();
  });

  it("keeps Suggestions above the import panel", () => {
    show([active], createApi(), true, "user", "#specific");
    fireEvent.click(screen.getByRole("button", { name: "Import Movies" }));
    expect(
      suggestions()!.compareDocumentPosition(
        screen.getByRole("region", { name: "Movie titles" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves other lists alone", () => {
    show([watched, active], createApi(), true, "user", "Our #horror picks");
    expect(suggestions()).toBeNull();
    expect(watchedToggle()).toBeTruthy();
  });

  it.each([
    ["non-admin members", createApi(), false, "user"],
    ["signed-out visitors", null, false, null],
    ["read-only views, even for an admin", null, true, "user"],
  ])(
    "shows neither Suggestions nor Watched to %s",
    (_who, api, admin, user) => {
      show([watched, active], api, admin, user, "#specific");
      expect(suggestions()).toBeNull();
      expect(watchedToggle()).toBeNull();
      expect(screen.getByText("Active movie")).toBeTruthy();
    },
  );

  it("gives Suggestions every movie on the list, watched or not, and the real API", async () => {
    const api = createApi();
    show([watched, active], api, true, "user", "#specific");
    expect(screen.getByLabelText("On the list").textContent).toBe("123,456");

    fireEvent.click(screen.getByRole("button", { name: "Fake suggest" }));
    expect(api.suggest).toHaveBeenCalledWith(["Heat"]);
    fireEvent.click(screen.getByRole("button", { name: "Fake add" }));
    expect(api.nominate).toHaveBeenCalledWith({ id: 5 }, "Because");
  });
});

describe("movie club lists", () => {
  const person = (id: string): Person => ({ id, name: id, username: id });
  const nominated = (
    id: number,
    title: string,
    { by = "friend", voters = [] }: { by?: string; voters?: Person[] } = {},
  ): Nomination => ({
    ...watched,
    id,
    movieId: id,
    userId: by,
    completedAt: null,
    movie: {
      ...watched.movie,
      id,
      tmdbId: id,
      details: { title } as Nomination["movie"]["details"],
    },
    nominator: person(by),
    extensions: { movieclub: { voters } },
  });
  // A non-admin member, which is what most club members are.
  const showClub = (nominees: Nomination[], api = createApi()) =>
    show(nominees, api, false, "user", "Our #movieclub", true, [VOTES_SORT]);
  const upvote = (title: string) =>
    screen.queryByRole("button", { name: `Upvote ${title}` });
  const unvote = (title: string) =>
    screen.queryByRole("button", { name: `Remove a vote from ${title}` });
  const addNomination = () =>
    screen.queryByRole("button", { name: "Add nomination" });

  it("lets members nominate", () => {
    showClub([]);
    expect(addNomination()).toBeTruthy();
  });

  it("lets members nominate on ordinary lists", () => {
    show([], createApi(), false, "user", "Just movies", true);
    expect(addNomination()).toBeTruthy();
  });

  it.each([
    ["signed-in nonmembers of ordinary lists", "Just movies", "user", false],
    ["signed-out viewers of ordinary lists", "Just movies", null, false],
    ["signed-in people who aren't members", "Our #movieclub", "user", false],
    ["signed-out visitors", "Our #movieclub", null, false],
  ])("doesn't let %s nominate", (_who, description, user, isMember) => {
    show([], createApi(), false, user, description, isMember);
    expect(addNomination()).toBeNull();
  });

  it.each([
    ["their own pick", "Arrival", true],
    ["someone else's pick", "Heat", false],
  ])("lets a member delete %s? %s", (_whose, title, canDelete) => {
    showClub([nominated(1, "Arrival", { by: "user" }), nominated(2, "Heat")]);
    fireEvent.click(screen.getByText(title));
    expect(
      Boolean(
        screen.queryByRole("button", {
          name: `Delete ${title} from the watchlist`,
        }),
      ),
    ).toBe(canDelete);
  });

  it.each([
    ["their own pick", "user", true],
    ["someone else's pick", "friend", false],
  ])("lets an ordinary list member delete %s? %s", (_whose, by, canDelete) => {
    show(
      [nominated(1, "Arrival", { by })],
      createApi(),
      false,
      "user",
      "Just movies",
      true,
    );
    fireEvent.click(screen.getByText("Arrival"));
    expect(
      Boolean(
        screen.queryByRole("button", {
          name: "Delete Arrival from the watchlist",
        }),
      ),
    ).toBe(canDelete);
  });

  it("lets members delete their own watched nomination", () => {
    show([watched], createApi(), false, "user", "Just movies", true);
    fireEvent.click(screen.getByRole("button", { name: /Watched/ }));
    fireEvent.click(screen.getByText("Watched movie"));
    expect(
      screen.getByRole("button", {
        name: "Delete Watched movie from the watchlist",
      }),
    ).toBeTruthy();
  });

  it("doesn't let a signed-in nonmember delete their own old nomination", () => {
    show(
      [nominated(1, "Arrival", { by: "user" })],
      createApi(),
      false,
      "user",
      "Just movies",
      false,
    );
    fireEvent.click(screen.getByText("Arrival"));
    expect(
      screen.queryByRole("button", {
        name: "Delete Arrival from the watchlist",
      }),
    ).toBeNull();
  });

  it("keeps club cards to the voting widget, without nomination metadata", () => {
    showClub([
      nominated(1, "Arrival", { by: "sam" }),
      nominated(2, "Heat", { by: "alex" }),
      nominated(3, "Alien", { by: "friend" }),
    ]);
    expect(
      screen
        .getAllByRole("article")
        .every((card) => card.getAttribute("data-show-meta") === "false"),
    ).toBe(true);
  });

  it("shows totals on cards and moves the voter avatars to discussion", () => {
    showClub([
      nominated(1, "Arrival", { voters: [person("sam"), person("alex")] }),
      nominated(2, "Heat"),
    ]);
    expect(screen.getByRole("img", { name: "2 upvotes" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "0 upvotes" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Upvoted by" })).toBeNull();
    fireEvent.click(screen.getByText("Arrival"));
    const discussion = within(
      screen.getByRole("region", { name: "Discussion about Arrival" }),
    );
    const names = within(discussion.getByRole("list", { name: "Upvoted by" }))
      .getAllByRole("img")
      .map((avatar) => avatar.getAttribute("aria-label"));
    expect(names).toEqual(["sam", "alex"]);
  });

  it("counts your votes left", () => {
    showClub([
      nominated(1, "Arrival", { voters: [person("user"), person("user")] }),
      nominated(2, "Heat", { voters: [person("user"), person("sam")] }),
      nominated(3, "Alien", { voters: [person("sam")] }),
    ]);
    expect(screen.getByText("2 votes left").closest("header")).toBeTruthy();
  });

  it("uses the singular label for one vote left", () => {
    showClub([
      nominated(1, "Arrival", {
        voters: Array.from({ length: 4 }, () => person("user")),
      }),
    ]);
    expect(screen.getByText("1 vote left").closest("header")).toBeTruthy();
  });

  it("keeps the remaining votes in the header even when the club is empty", () => {
    showClub([]);
    expect(screen.getByText("5 votes left").closest("header")).toBeTruthy();
  });

  it("shows the total and your contribution, with repeat-vote badges only in discussion", () => {
    showClub([
      nominated(7, "Arrival", {
        voters: [person("user"), person("user"), person("sam")],
      }),
      nominated(8, "Heat"),
    ]);
    const cards = screen.getAllByRole("article");
    expect(within(cards[0]).getByRole("status").textContent).toBe(
      "32 from you",
    );
    expect(
      within(cards[1]).getByRole("img", { name: "0 upvotes" }),
    ).toBeTruthy();
    expect(within(cards[1]).queryByText(/from you$/)).toBeNull();
    expect(screen.queryByRole("list", { name: "Upvoted by" })).toBeNull();
    fireEvent.click(screen.getByText("Arrival"));
    expect(screen.getAllByRole("img", { name: "user, 2 votes" })).toHaveLength(
      1,
    );
    expect(
      within(screen.getByRole("list", { name: "Upvoted by" })).getAllByRole(
        "img",
      ),
    ).toHaveLength(2);
    expect((unvote("Heat") as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ["vote", "Heat", 8],
    ["vote", "Arrival", 7],
    ["unvote", "Arrival", 7],
  ] as const)("%s when you tap %s", (action, title, nominationId) => {
    const api = createApi();
    showClub(
      [
        nominated(7, "Arrival", { voters: [person("user")] }),
        nominated(8, "Heat"),
      ],
      api,
    );
    fireEvent.click((action === "vote" ? upvote : unvote)(title)!);
    expect(api.vote).toHaveBeenCalledWith(nominationId, action);
  });

  it("shows why a vote didn't go through", async () => {
    const api = createApi();
    vi.mocked(api.vote).mockRejectedValueOnce(
      new Error("You're out of votes this month."),
    );
    showClub([nominated(1, "Arrival")], api);
    fireEvent.click(upvote("Arrival")!);
    await screen.findByText("You're out of votes this month.");
  });

  it("doesn't offer a vote on your own pick", () => {
    showClub([nominated(1, "Arrival", { by: "user" })]);
    expect(upvote("Arrival")).toBeNull();
    expect(screen.getByRole("img", { name: "0 upvotes" })).toBeTruthy();
  });

  it("stops new votes once all five are spent, but lets you take one back", () => {
    const mine = [person("user")];
    showClub([
      ...["Alien", "Brazil", "Clue", "Dune", "Ran"].map((title, i) =>
        nominated(i + 1, title, { voters: mine }),
      ),
      nominated(6, "Arrival"),
    ]);
    expect(screen.getByText("0 votes left")).toBeTruthy();
    expect((upvote("Arrival") as HTMLButtonElement).disabled).toBe(true);
    expect((upvote("Alien") as HTMLButtonElement).disabled).toBe(true);
    expect((unvote("Alien") as HTMLButtonElement).disabled).toBe(false);
    expect((unvote("Arrival") as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers the upvotes sort", () => {
    showClub([]);
    expect(screen.getByLabelText("Sorts").textContent).toContain("votes");
  });

  it("applies a sort supplied from outside the component", () => {
    const custom: SortOption = {
      id: "reverse-title",
      label: "Reverse title",
      compare: (a, b) =>
        b.movie.details.title.localeCompare(a.movie.details.title),
    };
    show(
      [nominated(1, "Arrival"), nominated(2, "Heat")],
      createApi(),
      false,
      "user",
      "Just movies",
      true,
      [custom],
      { sort: custom.id, filters: [] },
    );
    expect(screen.getByLabelText("Sorts").textContent).toBe("reverse-title");
    expect(
      screen.getAllByRole("article").map((article) => article.textContent),
    ).toEqual(["Heat", "Arrival"]);
  });

  it("shows read-only viewers totals, with voter avatars in discussion and no personal count", () => {
    show(
      [nominated(1, "Arrival", { voters: [person("sam")] })],
      null,
      false,
      null,
      "#movieclub",
    );
    expect(upvote("Arrival")).toBeNull();
    expect(screen.getByRole("img", { name: "1 upvote" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Upvoted by" })).toBeNull();
    fireEvent.click(screen.getByText("Arrival"));
    expect(screen.getByRole("img", { name: "sam" })).toBeTruthy();
    expect(screen.queryByText(/votes left/)).toBeNull();
  });

  it("stays off ordinary lists", () => {
    show(
      [nominated(1, "Arrival", { voters: [person("sam")] })],
      createApi(),
      true,
      "user",
      "Just movies",
      true,
    );
    expect(upvote("Arrival")).toBeNull();
    expect(screen.queryByRole("list", { name: "Upvoted by" })).toBeNull();
    expect(screen.queryByText(/votes left/)).toBeNull();
    expect(screen.queryByLabelText("Sorts")).toBeNull();
  });
});

describe("picked movie actions", () => {
  const film = (id: number, title: string): Nomination => ({
    ...watched,
    id,
    movieId: id,
    completedAt: null,
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
    const save = Promise.withResolvers<void>();
    vi.mocked(api.markWatched).mockReturnValue(save.promise);
    show([arrival, heat], api);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.click(screen.getByText("Heat"));
    fireEvent.click(more());
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark watched" }));
    expect(celebrate).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: "Compare movies" })).toBeTruthy();
    await act(async () => save.resolve());
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
      expect(
        screen.queryByRole("region", { name: "Compare movies" }),
      ).toBeNull(),
    );
    expect(api.markWatched).toHaveBeenCalledWith([10]);
    expect(celebrate).not.toHaveBeenCalled();
  });

  it("still reports a failed bulk watched save after celebrating immediately", async () => {
    const api = createApi();
    vi.mocked(api.markWatched).mockRejectedValue(new Error("Save failed"));
    show([arrival], api);
    fireEvent.contextMenu(screen.getByText("Arrival"));
    fireEvent.click(more());
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark watched" }));
    expect(celebrate).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByText("Save failed")).toBeTruthy());
    expect(celebrate).toHaveBeenCalledOnce();
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
