// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import type { Oscars as OscarData } from "@/app/lib/data/oscars";
import { OscarsArchive } from "./OscarsArchive";

const dataset: OscarData = {
  updatedThrough: 2023,
  movies: {
    tt15398776: {
      shortlistId: 42,
      wins: 1,
      nominations: 1,
      entries: [
        {
          id: 1,
          year: "2023",
          category: "BEST PICTURE",
          name: "Emma Thomas",
          winner: true,
          major: true,
        },
      ],
    },
    tt1517268: {
      shortlistId: 43,
      wins: 0,
      nominations: 1,
      entries: [
        {
          id: 2,
          year: "2023",
          category: "BEST PICTURE",
          name: "Margot Robbie",
          winner: false,
          major: true,
        },
      ],
    },
    tt0019071: {
      shortlistId: 10,
      wins: 1,
      nominations: 1,
      entries: [
        {
          id: 7,
          year: "1927/28",
          category: "ACTOR IN A LEADING ROLE",
          name: "Emil Jannings",
          winner: true,
          major: true,
        },
      ],
    },
    tt0019553: {
      shortlistId: 11,
      wins: 1,
      nominations: 1,
      entries: [
        {
          id: 7,
          year: "1927/28",
          category: "ACTOR IN A LEADING ROLE",
          name: "Emil Jannings",
          winner: true,
          major: true,
        },
      ],
    },
  },
  nominees: {
    "2022|BEST PICTURE": [
      {
        id: 3,
        film: "Everything Everywhere All at Once",
        name: "Producers",
        winner: true,
      },
    ],
    "1927/28|WRITING (Title Writing)": [
      { id: 6, name: "Joseph Farnham", winner: true },
      { id: 8, name: "George Marion, Jr.", winner: false },
    ],
    "2023|BEST PICTURE": [
      { id: 1, film: "Oppenheimer", name: "Emma Thomas", winner: true },
      { id: 2, film: "Barbie", name: "Margot Robbie", winner: false },
      { id: 9, film: "Past Lives", name: "Producers", winner: false },
    ],
    "1927/28|BEST PICTURE": [
      { id: 4, film: "Wings", name: "Paramount", winner: true },
    ],
    "1927/28|ACTOR IN A LEADING ROLE": [
      { id: 7, name: "Emil Jannings", winner: true },
    ],
    "1931/32|BEST PICTURE": [
      { id: 12, film: "Grand Hotel", name: "MGM", winner: true },
    ],
    "1931/32|ACTOR IN A LEADING ROLE": [
      { id: 13, film: "The Champ", name: "Wallace Beery", winner: true },
      {
        id: 14,
        film: "Dr. Jekyll and Mr. Hyde",
        name: "Fredric March",
        winner: true,
      },
      { id: 15, film: "The Guardsman", name: "Alfred Lunt", winner: false },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("starts with every decade collapsed and orders award years newest first", async () => {
  renderArchive();
  await screen.findByRole("button", { name: "2020s" });
  expect(
    screen.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["2020s", "1930s", "1920s"]);
  expect(
    screen
      .getAllByRole("button")
      .every((button) => button.getAttribute("aria-expanded") === "false"),
  ).toBe(true);
  expect(screen.queryByText("Oppenheimer")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "2020s" }));
  const years = within(screen.getByRole("list", { name: "2020s award years" }));
  expect(
    years.getAllByRole("button").map((button) => button.textContent),
  ).toEqual(["2023 Oppenheimer", "2022 Everything Everywhere All at Once"]);
  expect(
    years
      .getByRole("link", { name: "View movie: Oppenheimer" })
      .getAttribute("href"),
  ).toBe("/m/42");
  expect(
    screen.queryByRole("list", { name: "Categories for 2023" }),
  ).toBeNull();
});

it("expands through categories to nominees while keeping movie navigation separate", async () => {
  renderArchive();
  fireEvent.click(await screen.findByRole("button", { name: "2020s" }));
  const year = screen.getByRole("button", { name: "2023 Oppenheimer" });
  const movieLink = screen.getByRole("link", {
    name: "View movie: Oppenheimer",
  });
  movieLink.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(movieLink);
  expect(year.getAttribute("aria-expanded")).toBe("false");
  expect(movieLink.closest("button")).toBeNull();

  fireEvent.click(year);
  const categories = within(
    screen.getByRole("list", { name: "Categories for 2023" }),
  );
  const award = categories.getByRole("button", {
    name: /Best Picture.*Oppenheimer/,
  });
  expect(screen.queryByText("Barbie")).toBeNull();
  fireEvent.click(award);

  const nominees = within(
    screen.getByRole("list", { name: "Other nominees for Best Picture, 2023" }),
  );
  expect(
    nominees
      .getByRole("link", { name: "Barbie Margot Robbie" })
      .getAttribute("href"),
  ).toBe("/m/43");
  expect(nominees.getByText("Past Lives").closest("a")).toBeNull();
  expect(nominees.queryByText("Oppenheimer")).toBeNull();
  expect(award.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(award);
  expect(award.getAttribute("aria-expanded")).toBe("false");
});

it("preserves early year labels, film-less awards and links for multi-film winners", async () => {
  renderArchive();
  fireEvent.click(await screen.findByRole("button", { name: "1920s" }));
  fireEvent.click(screen.getByRole("button", { name: "1927/28 Wings" }));
  const categories = within(
    screen.getByRole("list", { name: "Categories for 1927/28" }),
  );
  expect(categories.getAllByRole("listitem")[0].textContent).toContain(
    "Best Picture",
  );
  expect(
    categories
      .getByRole("link", { name: "View movie 1: Emil Jannings" })
      .getAttribute("href"),
  ).toBe("/m/10");
  expect(
    categories
      .getByRole("link", { name: "View movie 2: Emil Jannings" })
      .getAttribute("href"),
  ).toBe("/m/11");
  fireEvent.click(
    categories.getByRole("button", { name: /Title Writing.*Joseph Farnham/ }),
  );
  expect(screen.getByText("George Marion, Jr.")).toBeTruthy();
  expect(screen.getByText("George Marion, Jr.").closest("a")).toBeNull();
});

it("shows every tied winner and excludes them all from the other nominees", async () => {
  renderArchive();
  fireEvent.click(await screen.findByRole("button", { name: "1930s" }));
  fireEvent.click(screen.getByRole("button", { name: "1931/32 Grand Hotel" }));
  const award = screen.getByRole("button", { name: /Actor In A Leading Role/ });
  expect(award.textContent).toContain("Wallace Beery");
  expect(award.textContent).toContain("Fredric March");
  fireEvent.click(award);
  const nominees = within(
    screen.getByRole("list", {
      name: "Other nominees for Actor In A Leading Role, 1931/32",
    }),
  );
  expect(nominees.getAllByRole("listitem")).toHaveLength(1);
  expect(nominees.getByText("Alfred Lunt")).toBeTruthy();
});

it("shows loading and a retryable error instead of an empty archive after a failure", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValue({ ok: true, json: async () => dataset });
  vi.stubGlobal("fetch", fetcher);
  mountArchive();
  expect(screen.getByRole("status").textContent).toContain("Loading");
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Couldn't load",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByRole("button", { name: "2020s" })).toBeTruthy();
});

it("shows an explicit empty state", async () => {
  renderArchive({ ...dataset, nominees: {} });
  expect(
    await screen.findByText("No Oscar results are available yet."),
  ).toBeTruthy();
});

function renderArchive(data = dataset) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => data }),
  );
  mountArchive();
}

function mountArchive() {
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <OscarsArchive />
    </SWRConfig>,
  );
}
