// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Movie, Nomination } from "@/src/db/schema";
import { Suggestions } from "./Suggestions";

const grid = vi.hoisted(() => ({
  render: vi.fn(),
  mount: vi.fn(),
  unmount: vi.fn(),
}));
const motion = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => motion.reducedMotion,
}));

// Wraps the real grid so the tests can see how it's used without changing it.
vi.mock("./MovieGrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./MovieGrid")>();
  return {
    MovieGrid: (props: ComponentProps<typeof actual.MovieGrid>) => {
      grid.render(props.animation);
      useEffect(() => {
        grid.mount();
        return grid.unmount;
      }, []);
      return <actual.MovieGrid {...props} />;
    },
  };
});

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  motion.reducedMotion = false;
  // motion calls this after measuring `height: auto`, and jsdom doesn't have it
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const suggestion = (
  id: number,
  title = `Movie ${id}`,
  reason: string | null = `${title} fits.`,
  tmdbId: number | null = id * 100,
): Nomination => ({
  id: -id,
  theatreId: "theatre",
  userId: "user",
  movieId: id,
  comment: reason,
  completedAt: null,
  createdAt: new Date(),
  movie: {
    id,
    tmdbId,
    createdAt: new Date(),
    details: { title, posterUrl: null } as Nomination["movie"]["details"],
    ratings: { raw: {}, services: [] },
  },
  nomcoms: [],
  nominator: { id: "user", name: "User", username: "user" },
  seenBy: [],
});

// Each batch is what one press of the Suggest button gets back.
const setup = (batches: Nomination[][] = [], existing = new Set<number>()) => {
  const onSuggest = vi.fn<(exclude: string[]) => Promise<Nomination[]>>();
  batches.forEach((batch) => onSuggest.mockResolvedValueOnce(batch));
  const onNominate = vi
    .fn<(movie: Movie, comment: string) => Promise<void>>()
    .mockResolvedValue(undefined);
  const ui = (ids: Set<number>) => (
    <Suggestions existing={ids} onSuggest={onSuggest} onNominate={onNominate} />
  );
  const view = render(ui(existing));
  return {
    onSuggest,
    onNominate,
    setExisting: (ids: Set<number>) => view.rerender(ui(ids)),
  };
};

const suggest = () =>
  fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
const card = (title: string) =>
  screen.findByRole("button", { name: `Review suggestion: ${title}` });
const cardNames = () =>
  screen
    .queryAllByRole("button", { name: /Review suggestion/ })
    .map((button) => button.getAttribute("aria-label"));
const status = () => screen.getByRole("status").textContent;
const note = () =>
  screen.findByRole("textbox", {
    name: "Why should we watch it?",
  }) as Promise<HTMLTextAreaElement>;

describe("suggest button", () => {
  it("starts with a prompt and no movies", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Suggestions" })).toBeTruthy();
    expect(status()).toBe("Get movie ideas that fit this list's description.");
    expect(cardNames()).toEqual([]);
  });

  it("shows progress and ignores extra taps while asking", async () => {
    const { onSuggest } = setup();
    const pending = Promise.withResolvers<Nomination[]>();
    onSuggest.mockReturnValueOnce(pending.promise);

    suggest();
    const busy = screen.getByRole("button", { name: "Thinking..." });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(status()).toBe("Looking for movies...");
    fireEvent.click(busy);
    expect(onSuggest).toHaveBeenCalledTimes(1);

    pending.resolve([suggestion(1, "Heat")]);
    await card("Heat");
    expect(
      screen.getByRole("button", { name: "Suggest" }).getAttribute("aria-busy"),
    ).toBe("false");
    expect(status()).toBe("Tap a movie to see why it fits and add it.");
  });

  it("keeps the same grid mounted whether or not it has movies", async () => {
    setup([[suggestion(1, "Heat")]]);
    expect(grid.mount).toHaveBeenCalledTimes(1);

    suggest();
    fireEvent.click(await card("Heat"));
    fireEvent.click(await screen.findByRole("button", { name: /Add movie/ }));
    await waitFor(() => expect(cardNames()).toEqual([]));

    expect(grid.mount).toHaveBeenCalledTimes(1);
    expect(grid.unmount).not.toHaveBeenCalled();
    expect(new Set(grid.render.mock.calls.flat())).toEqual(new Set(["slide"]));
  });
});

describe("what it asks for", () => {
  it("sends nothing the first time, then every title it has offered", async () => {
    const { onSuggest } = setup([
      [suggestion(1, "Heat"), suggestion(2, "Ronin")],
      [suggestion(2, "Ronin"), suggestion(3, "Drive")],
    ]);

    suggest();
    await card("Ronin");
    expect(onSuggest).toHaveBeenNthCalledWith(1, []);

    suggest();
    await card("Drive");
    expect(onSuggest).toHaveBeenNthCalledWith(2, ["Heat", "Ronin"]);
    expect(cardNames()).toEqual([
      "Review suggestion: Heat",
      "Review suggestion: Ronin",
      "Review suggestion: Drive",
    ]);
  });

  it("trims titles and drops blank ones", async () => {
    const { onSuggest } = setup([
      [
        suggestion(1, "  Padded  "),
        suggestion(2, "y".repeat(250)),
        suggestion(3, "   "),
      ],
      [],
    ]);

    suggest();
    await waitFor(() => expect(cardNames()).toHaveLength(3));
    suggest();
    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(2));
    expect(onSuggest).toHaveBeenLastCalledWith(["Padded", "y".repeat(200)]);
  });

  it("only sends the latest 100 titles, which is what the route accepts", async () => {
    const many = Array.from({ length: 105 }, (_, index) =>
      suggestion(index + 1),
    );
    const { onSuggest } = setup([many, []]);

    suggest();
    await waitFor(() => expect(cardNames()).toHaveLength(105));
    suggest();
    await waitFor(() => expect(onSuggest).toHaveBeenCalledTimes(2));
    const [sent] = onSuggest.mock.calls[1];
    expect(sent).toHaveLength(100);
    expect(sent[0]).toBe("Movie 6");
    expect(sent.at(-1)).toBe("Movie 105");
  });
});

describe("what comes back", () => {
  it("says so when a request found nothing new, even with older movies showing", async () => {
    setup([[], [suggestion(1, "Heat")], [suggestion(1, "Heat")]]);

    suggest();
    await waitFor(() =>
      expect(status()).toBe("Nothing new to suggest right now."),
    );

    suggest();
    await card("Heat");
    expect(status()).toBe("Tap a movie to see why it fits and add it.");

    suggest();
    await waitFor(() =>
      expect(status()).toBe("Nothing new to suggest right now."),
    );
    expect(cardNames()).toEqual(["Review suggestion: Heat"]);
  });

  it("shows why a request failed and clears it on the next try", async () => {
    const { onSuggest } = setup();
    onSuggest
      .mockRejectedValueOnce(
        new Error("Give it a few seconds, then try again."),
      )
      .mockResolvedValueOnce([suggestion(1, "Heat")]);

    suggest();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Give it a few seconds, then try again.",
    );
    expect(
      screen.getByRole("button", { name: "Suggest" }).getAttribute("aria-busy"),
    ).toBe("false");

    suggest();
    await card("Heat");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has a generic message when the failure has no message", async () => {
    const { onSuggest } = setup();
    onSuggest.mockRejectedValueOnce("nope");

    suggest();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Unable to get suggestions.",
    );
  });

  it("hides movies already on the list, but keeps ones with no TMDB id", async () => {
    const { setExisting } = setup(
      [
        [
          suggestion(1, "Heat"),
          suggestion(2, "Ronin"),
          suggestion(3, "Unmatched", null, null),
        ],
      ],
      new Set([100]),
    );

    suggest();
    await card("Ronin");
    expect(cardNames()).toEqual([
      "Review suggestion: Ronin",
      "Review suggestion: Unmatched",
    ]);

    setExisting(new Set([100, 200]));
    await waitFor(() =>
      expect(cardNames()).toEqual(["Review suggestion: Unmatched"]),
    );
  });
});

describe("adding a suggestion", () => {
  it("opens the add form with the reason as the note", async () => {
    setup([
      [
        suggestion(1, "Heat", "A crew and a cop."),
        suggestion(2, "Ronin", "Spies and cars."),
      ],
    ]);

    suggest();
    fireEvent.click(await card("Heat"));
    expect((await note()).value).toBe("A crew and a cop.");
    expect(screen.getByRole("heading", { name: "Heat" })).toBeTruthy();

    fireEvent.click(await card("Ronin"));
    await waitFor(() => expect(screen.getAllByRole("textbox")).toHaveLength(1));
    expect((await note()).value).toBe("Spies and cars.");
  });

  it("scrolls the section to the top of the screen once the form has opened", async () => {
    setup([[suggestion(1, "Heat"), suggestion(2, "Ronin")]]);

    suggest();
    fireEvent.click(await card("Heat"));
    expect(scrollIntoView).not.toHaveBeenCalled();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));

    fireEvent.click(await card("Ronin"));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));

    const section = screen.getByRole("region", { name: "Suggestions" });
    expect(scrollIntoView.mock.contexts).toEqual([section, section]);
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });
  });

  it("jumps instead of gliding for reduced motion", async () => {
    motion.reducedMotion = true;
    setup([[suggestion(1, "Heat")]]);

    suggest();
    fireEvent.click(await card("Heat"));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });

  it("does not scroll if the form is closed before it finishes opening", async () => {
    setup([[suggestion(1, "Heat")]]);

    suggest();
    fireEvent.click(await card("Heat"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel nomination" }));
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("starts with an empty note when there was no reason", async () => {
    setup([[suggestion(1, "Heat", null)]]);

    suggest();
    fireEvent.click(await card("Heat"));
    expect((await note()).value).toBe("");
  });

  it("adds with the edited note, then drops the suggestion and closes the form", async () => {
    const { onNominate } = setup([
      [suggestion(1, "Heat", "A crew and a cop."), suggestion(2, "Ronin")],
    ]);

    suggest();
    fireEvent.click(await card("Heat"));
    fireEvent.change(await note(), {
      target: { value: "Pacino and De Niro." },
    });
    fireEvent.click(screen.getByRole("button", { name: /Add movie/ }));

    await waitFor(() =>
      expect(onNominate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1 }),
        "Pacino and De Niro.",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    await waitFor(() =>
      expect(cardNames()).toEqual(["Review suggestion: Ronin"]),
    );
  });

  it("shows progress on the form, not on the suggest button", async () => {
    const { onNominate } = setup([[suggestion(1, "Heat")]]);
    const pending = Promise.withResolvers<void>();
    onNominate.mockReturnValueOnce(pending.promise);

    suggest();
    fireEvent.click(await card("Heat"));
    await note();
    fireEvent.click(screen.getByRole("button", { name: /Add movie/ }));

    const adding = await screen.findByRole("button", { name: /Adding/ });
    expect((adding as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "Suggest" }).getAttribute("aria-busy"),
    ).toBe("false");

    pending.resolve();
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
  });

  it("keeps the form usable while more suggestions load", async () => {
    const { onSuggest } = setup([[suggestion(1, "Heat")]]);

    suggest();
    fireEvent.click(await card("Heat"));
    await note();
    const pending = Promise.withResolvers<Nomination[]>();
    onSuggest.mockReturnValueOnce(pending.promise);
    suggest();

    const add = screen.getByRole("button", { name: /Add movie/ });
    expect((add as HTMLButtonElement).disabled).toBe(false);
    pending.resolve([]);
    await screen.findByRole("button", { name: "Suggest" });
  });

  it("keeps the form open with the error when adding fails, and retries", async () => {
    const { onNominate } = setup([
      [suggestion(1, "Heat"), suggestion(2, "Ronin")],
    ]);
    onNominate.mockRejectedValueOnce(new Error("Couldn't add that."));

    suggest();
    fireEvent.click(await card("Heat"));
    await note();
    fireEvent.click(screen.getByRole("button", { name: /Add movie/ }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't add that.",
    );
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(cardNames()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Add movie/ }));
    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(onNominate).toHaveBeenCalledTimes(2);
  });

  it("doesn't carry one form's error over to the next suggestion", async () => {
    const { onNominate } = setup([
      [suggestion(1, "Heat"), suggestion(2, "Ronin")],
    ]);
    onNominate.mockRejectedValueOnce(new Error("Couldn't add that."));

    suggest();
    fireEvent.click(await card("Heat"));
    await note();
    fireEvent.click(screen.getByRole("button", { name: /Add movie/ }));
    await screen.findByRole("alert");

    fireEvent.click(await card("Ronin"));
    await waitFor(() => expect(screen.getAllByRole("textbox")).toHaveLength(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes on cancel and keeps the suggestion", async () => {
    setup([[suggestion(1, "Heat")]]);

    suggest();
    fireEvent.click(await card("Heat"));
    await note();
    fireEvent.click(screen.getByRole("button", { name: "Cancel nomination" }));

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(cardNames()).toEqual(["Review suggestion: Heat"]);
  });

  it("closes when its movie lands on the list another way, and stays closed", async () => {
    const { setExisting } = setup([[suggestion(1, "Heat")]]);

    suggest();
    fireEvent.click(await card("Heat"));
    await note();

    setExisting(new Set([100]));
    await waitFor(() => expect(cardNames()).toEqual([]));
    expect(screen.queryByRole("textbox")).toBeNull();

    setExisting(new Set());
    await card("Heat");
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
