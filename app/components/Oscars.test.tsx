// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Movie, MovieDetails } from "@/src/db/schema";
import { SWRConfig } from "swr";
import { Oscars } from "./Oscars";

const movie = {
  id: 1,
  tmdbId: 157336,
  createdAt: new Date(),
  details: {
    id: 157336,
    title: "Interstellar",
    imdb_id: "tt0816692",
  } as MovieDetails,
  ratings: { services: [], raw: {} },
} satisfies Movie;

const interstellar = {
  updatedThrough: 2025,
  movies: {
    tt0816692: {
      wins: 1,
      nominations: 5,
      entries: [
        {
          id: 101,
          year: "2014",
          category: "PRODUCTION DESIGN",
          winner: false,
          major: false,
          name: "Nathan Crowley",
        },
        {
          id: 102,
          year: "2014",
          category: "CINEMATOGRAPHY",
          winner: true,
          major: true,
          name: "Paul Franklin",
        },
      ],
    },
  },
  nominees: {
    "2014|PRODUCTION DESIGN": [
      {
        id: 100,
        film: "The Grand Budapest Hotel",
        name: "Adam Stockhausen; Anna Pinnock",
        winner: true,
      },
      { id: 101, film: "Interstellar", name: "Nathan Crowley", winner: false },
      {
        id: 103,
        film: "Into the Woods",
        name: "Dennis Gassner",
        winner: false,
      },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Oscars", () => {
  it("shows an expandable summary for multiple nominations", async () => {
    stubOscars(interstellar);

    renderMovieOscars();

    expect(await screen.findByText("Won 1 Major Oscar")).toBeTruthy();
    expect(screen.getByText("1 major nomination · 5 total")).toBeTruthy();
    fireEvent.click(screen.getByText("Won 1 Major Oscar"));
    const entries = screen.getAllByRole("listitem");
    expect(entries[0].textContent).toContain("Production Design");
    expect(entries[1].textContent).toContain("Cinematography");
    expect(screen.getByText("Winner")).toBeTruthy();
    expect(screen.getByText("Paul Franklin")).toBeTruthy();
  });

  it("slides open the other nominees for an award", async () => {
    stubOscars(interstellar);

    renderMovieOscars();
    fireEvent.click(await screen.findByText("Won 1 Major Oscar"));
    const toggle = screen.getByRole("button", { name: /Production Design/ });
    const listName = "Other nominees for Production Design, 2014";
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: listName })).toBeNull();
    expect(screen.queryByRole("button", { name: /Cinematography/ })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const others = within(
      screen.getByRole("list", { name: listName }),
    ).getAllByRole("listitem");
    expect(others.map(({ textContent }) => textContent)).toEqual([
      "The Grand Budapest HotelWinnerAdam Stockhausen; Anna Pinnock",
      "Into the WoodsDennis Gassner",
    ]);

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await waitFor(() =>
      expect(screen.queryByRole("list", { name: listName })).toBeNull(),
    );
  });

  it("keeps the movie's other nominations for the same award", async () => {
    const actress = "1950|ACTRESS IN A LEADING ROLE";
    stubOscars({
      updatedThrough: 2025,
      movies: {
        tt0816692: {
          wins: 0,
          nominations: 2,
          entries: [
            { id: 11, name: "Bette Davis", detail: "Margo Channing" },
            { id: 12, name: "Anne Baxter", detail: "Eve Harrington" },
          ].map((entry) => ({
            ...entry,
            year: "1950",
            category: "ACTRESS IN A LEADING ROLE",
            winner: false,
            major: true,
          })),
        },
      },
      nominees: {
        [actress]: [
          {
            id: 10,
            film: "Born Yesterday",
            name: "Judy Holliday",
            winner: true,
            detail: "Billie Dawn",
          },
          {
            id: 11,
            film: "All about Eve",
            name: "Bette Davis",
            winner: false,
            detail: "Margo Channing",
          },
          {
            id: 12,
            film: "All about Eve",
            name: "Anne Baxter",
            winner: false,
            detail: "Eve Harrington",
          },
        ],
      },
    });

    renderMovieOscars();
    fireEvent.click(await screen.findByText("Nominated for 2 Major Oscars"));
    fireEvent.click(screen.getByRole("button", { name: /Bette Davis/ }));

    const others = within(
      screen.getByRole("list", {
        name: "Other nominees for Actress In A Leading Role, 1950",
      }),
    ).getAllByRole("listitem");
    expect(others.map(({ textContent }) => textContent)).toEqual([
      "Born YesterdayWinnerJudy Holliday — Billie Dawn",
      "All about EveAnne Baxter — Eve Harrington",
    ]);
  });

  it("lets a single nomination open its other nominees", async () => {
    stubOscars({
      updatedThrough: 2025,
      movies: {
        tt0816692: {
          wins: 0,
          nominations: 1,
          entries: [
            {
              id: 2,
              year: "1927/28",
              category: "WRITING (Title Writing)",
              winner: false,
              major: false,
              name: "Gerald Duffy",
            },
          ],
        },
      },
      nominees: {
        "1927/28|WRITING (Title Writing)": [
          { id: 1, name: "Joseph Farnham", winner: true },
          {
            id: 2,
            film: "The Private Life of Helen of Troy",
            name: "Gerald Duffy",
            winner: false,
          },
          { id: 3, name: "George Marion, Jr.", winner: false },
        ],
      },
    });

    renderMovieOscars();
    const toggle = await screen.findByRole("button", {
      name: /Nominated for Writing \(Title Writing\)/,
    });
    expect(toggle.textContent).toContain("1927/28 · Gerald Duffy");

    fireEvent.click(toggle);

    const others = within(
      screen.getByRole("list", {
        name: "Other nominees for Writing (Title Writing), 1927/28",
      }),
    ).getAllByRole("listitem");
    expect(others.map(({ textContent }) => textContent)).toEqual([
      "Joseph FarnhamWinner",
      "George Marion, Jr.",
    ]);
  });

  it("shows the full detail directly for one nomination", async () => {
    stubOscars({
      updatedThrough: 2025,
      movies: {
        tt0816692: {
          wins: 0,
          nominations: 1,
          entries: [
            {
              id: 201,
              year: "2014",
              category: "VISUAL EFFECTS",
              winner: false,
              major: false,
              name: "Paul Franklin",
            },
          ],
        },
      },
      nominees: {
        "2014|VISUAL EFFECTS": [
          {
            id: 201,
            film: "Interstellar",
            name: "Paul Franklin",
            winner: false,
          },
        ],
      },
    });

    renderMovieOscars();

    expect(
      await screen.findByText("Nominated for Visual Effects"),
    ).toBeTruthy();
    expect(screen.getByText("2014 · Paul Franklin")).toBeTruthy();
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

const stubOscars = (data: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => data }),
  );

const renderMovieOscars = () =>
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <Oscars movie={movie} />
    </SWRConfig>,
  );
