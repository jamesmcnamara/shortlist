// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, type TheatreSummaryWithMovies } from "@/app/lib/api";
import type { Nomination } from "@/src/db/schema";
import { CrossPost } from "./CrossPost";

const { create, theatres } = vi.hoisted(() => ({
  create: vi.fn(),
  theatres: { current: [] as TheatreSummaryWithMovies[] },
}));

vi.mock("@/app/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/app/lib/api")>();
  return {
    ...original,
    api: {
      ...original.api,
      theatre: (theatreId: string) => ({
        nominations: {
          create: (input: { movieId: number; comment: string }) =>
            create(theatreId, input),
        },
      }),
    },
  };
});

vi.mock("@/app/lib/data/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/data/queries")>()),
  useTheatresForMovies: () => ({
    data: theatres.current,
    error: undefined,
    retry: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  create.mockReset();
});

const film = (movieId: number, title: string, comment: string | null) =>
  ({
    id: movieId,
    movieId,
    comment,
    movie: { id: movieId, details: { title } },
  }) as Nomination;

const arrival = film(1, "Arrival", "Bring tissues");
const heat = film(2, "Heat", null);

const list = (id: string, name: string, movieIds: number[] = []) => ({
  id,
  name,
  watchlistFor: null,
  role: "member" as const,
  movieIds,
});

function show(onPosted = vi.fn(), onClose = vi.fn()) {
  render(
    <CrossPost
      films={[arrival, heat]}
      theatreId="here"
      onPosted={onPosted}
      onClose={onClose}
    />,
  );
  return { onPosted, onClose };
}

const note = (title: string) =>
  screen.getByRole("textbox", {
    name: `Note for ${title}`,
  }) as HTMLTextAreaElement;

describe("CrossPost", () => {
  it("leaves out the current theatre and pre-fills each recommendation", () => {
    theatres.current = [list("here", "This list"), list("a", "Friends")];
    show();
    expect(screen.queryByText("This list")).toBeNull();
    expect(screen.getByText("Friends")).toBeTruthy();
    expect(note("Arrival").value).toBe("Bring tissues");
    expect(note("Heat").value).toBe("");
  });

  it("posts every film with its edited note, skipping ones already there", async () => {
    theatres.current = [
      list("a", "Friends", [2]),
      list("b", "Family"),
      list("c", "Done", [1, 2]),
    ];
    create.mockResolvedValue({});
    const { onPosted, onClose } = show();

    expect(screen.getByText("Has 1 of 2")).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: /Done/ }) as HTMLInputElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(note("Heat"), { target: { value: "Classic" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Friends/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Family/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to 2 lists" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create.mock.calls).toEqual(
      expect.arrayContaining([
        ["a", { movieId: 1, comment: "Bring tissues" }],
        ["b", { movieId: 1, comment: "Bring tissues" }],
        ["b", { movieId: 2, comment: "Classic" }],
      ]),
    );
    expect(create).toHaveBeenCalledTimes(3);
    expect(onPosted).toHaveBeenCalledWith({ films: 2, lists: 2 });
  });

  it("stays open on a partial failure and only retries what failed", async () => {
    theatres.current = [list("a", "Friends")];
    create.mockImplementation((_theatreId, { movieId }) =>
      movieId === 2
        ? Promise.reject(new ApiError("Nope.", 500))
        : Promise.resolve({}),
    );
    const { onClose } = show();

    fireEvent.click(screen.getByRole("checkbox", { name: /Friends/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to 1 list" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Friends: Nope."),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Has 1 of 2")).toBeTruthy();

    create.mockReset();
    create.mockResolvedValue({});
    fireEvent.click(screen.getByRole("button", { name: "Add to 1 list" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(create.mock.calls).toEqual([["a", { movieId: 2, comment: "" }]]);
  });
});
