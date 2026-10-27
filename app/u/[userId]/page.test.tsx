// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import UserTheatres from "./page";

const data = vi.hoisted(() => ({
  viewer: vi.fn(),
  users: vi.fn(),
  theatres: vi.fn(),
}));

vi.mock("@/src/db/client", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({ where: () => ({ limit: data.users }) }),
    }),
  }),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUserId: data.viewer }));
vi.mock("@/app/lib/load-theatre", () => ({
  listPublicTheatresWithPosterPreviews: data.theatres,
}));
vi.mock("@/app/components/ShortlistHeader", () => ({
  ShortlistHeader: () => <header>Shortlist</header>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const USER = "11111111-1111-1111-1111-111111111111";
const VIEWER = "22222222-2222-2222-2222-222222222222";
const page = (userId = USER) =>
  UserTheatres({ params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.resetAllMocks();
  data.users.mockResolvedValue([{ name: "Alice" }]);
  data.viewer.mockResolvedValue(null);
  data.theatres.mockResolvedValue([
    {
      id: "club",
      name: "Movie Club",
      posterUrls: ["/poster.jpg"],
      tags: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ]);
});
afterEach(cleanup);

it.each([null, VIEWER])(
  "shows the user's theatres to viewer %s",
  async (viewer) => {
    data.viewer.mockResolvedValue(viewer);
    render(await page());
    expect(
      screen.getByRole("heading", { name: "Alice's Theatres" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Movie Club" }).getAttribute("href"),
    ).toBe("/theatres/club");
    expect(data.theatres).toHaveBeenCalledWith(USER, viewer);
  },
);

it("shows an empty profile without redirecting or prompting visitors to create lists", async () => {
  data.theatres.mockResolvedValue([]);
  render(await page());
  expect(screen.getByText("No theatres yet.")).toBeTruthy();
  expect(screen.queryByRole("link")).toBeNull();
});

it("returns not found for an invalid user ID before querying", async () => {
  await expect(page("invalid")).rejects.toThrow("NEXT_NOT_FOUND");
  expect(data.users).not.toHaveBeenCalled();
  expect(data.theatres).not.toHaveBeenCalled();
});

it("returns not found for a missing user", async () => {
  data.users.mockResolvedValue([]);
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(data.theatres).not.toHaveBeenCalled();
});
