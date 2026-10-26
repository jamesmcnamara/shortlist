// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { TheatreSummaryWithPosterPreviews } from "@/app/lib/api";
import { TheatreDirectory } from "./TheatreDirectory";

const theatres: TheatreSummaryWithPosterPreviews[] = [
  {
    id: "zombies", name: "Zombies", tags: ["horror", "2026"],
    posterUrls: ["/poster.jpg"], role: null, watchlistFor: null,
    createdAt: "2026-01-01", updatedAt: "2026-03-01",
  },
  {
    id: "aliens", name: "Aliens", tags: ["scifi", "2026"], posterUrls: [],
    role: null, watchlistFor: null, createdAt: "2026-02-01", updatedAt: "2026-02-01",
  },
  {
    id: "halloween", name: "Halloween", tags: [], posterUrls: [],
    role: null, watchlistFor: null, createdAt: "2026-03-01", updatedAt: "2026-01-01",
  },
];
const names = () => screen.queryAllByRole("link")
  .map((link) => link.querySelector("[class*='theatreName']")?.textContent);
beforeEach(() => window.history.replaceState(null, "", "/u/user"));
afterEach(cleanup);

it("shows sorted chips inside the single card link, including lists without posters", () => {
  render(<TheatreDirectory theatres={theatres} initialSearch="" />);
  const zombies = screen.getByRole("link", { name: /^Zombies / });
  expect(within(zombies).getAllByText(/^#/).map((tag) => tag.textContent))
    .toEqual(["#2026", "#horror"]);
  expect(within(zombies).queryByRole("button")).toBeNull();
  expect(screen.getByRole("link", { name: /^Aliens / })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Halloween" })).toBeTruthy();
});

it("filters titles immediately while retaining sort and filter controls", () => {
  render(<TheatreDirectory theatres={theatres} initialSearch="" />);
  const input = screen.getByRole("textbox", { name: "Search theatres" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "ZOM" } });
  expect(names()).toEqual(["Zombies"]);
  expect(window.location.search).toBe("?q=ZOM");
  expect(screen.getByRole("button", { name: "Sort by" })).toBeTruthy();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(names()).toHaveLength(3);
  expect(window.location.search).toBe("");
});

it("combines tags with AND and preserves query and unrelated URL values", () => {
  window.history.replaceState(null, "", "?q=o&extra=keep");
  render(<TheatreDirectory theatres={theatres} initialSearch="" />);
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  const filters = screen.getByRole("group", { name: "Filters" });
  fireEvent.click(within(filters).getByRole("button", { name: "#2026" }));
  fireEvent.click(within(filters).getByRole("button", { name: "#horror" }));
  expect(names()).toEqual(["Zombies"]);
  expect(screen.getByRole("button", { name: "Filter (2)" })).toBeTruthy();
  const params = new URLSearchParams(window.location.search);
  expect(params.getAll("tag")).toEqual(["2026", "horror"]);
  expect(params.get("extra")).toBe("keep");
  expect(params.get("q")).toBe("o");
});

it("sorts titles and restores URL state on browser navigation", () => {
  render(<TheatreDirectory theatres={theatres} initialSearch="" />);
  fireEvent.click(screen.getByRole("button", { name: "Sort by" }));
  fireEvent.click(screen.getByRole("button", { name: "Alphabetical" }));
  expect(names()[0]).toBe("Aliens");
  expect(window.location.search).toBe("?sort=title");
  act(() => {
    window.history.replaceState(null, "", "?sort=created&q=Halloween");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(names()).toEqual(["Halloween"]);
  expect(screen.getByRole("textbox").getAttribute("value")).toBe("Halloween");
});

it("keeps unknown selected tags removable and clears filters without resetting sort", () => {
  window.history.replaceState(null, "", "?sort=title&tag=missing");
  render(<TheatreDirectory theatres={theatres} initialSearch="" />);
  expect(screen.getByText("No matching theatres.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Filter (1)" }));
  expect(screen.getByRole("button", { name: "#missing" }).getAttribute("aria-pressed"))
    .toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Clear search and filters" }));
  expect(names()).toHaveLength(3);
  expect(window.location.search).toBe("?sort=title");
});

it("distinguishes an empty directory and no available tags", () => {
  render(<TheatreDirectory theatres={[]} initialSearch="" />);
  expect(screen.getByText("No theatres yet.")).toBeTruthy();
  expect(screen.queryByText("No matching theatres.")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Filter" }));
  expect(screen.getByText("No tags yet.")).toBeTruthy();
});
