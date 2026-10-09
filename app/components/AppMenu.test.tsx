// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppMenu } from "./AppMenu";

const data = vi.hoisted(() => ({
  userId: "alice",
  rooms: [
    { id: "ordinary", name: "Watchlist", watchlistFor: null },
    { id: "bobs", name: "Watchlist", watchlistFor: "bob" },
    { id: "alices", name: "Renamed movies", watchlistFor: "alice" },
  ],
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: data.userId, name: "Alice" } } }),
  },
}));
vi.mock("@/app/lib/data/queries", () => ({
  useRooms: () => ({ data: data.rooms }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
afterEach(cleanup);

describe("watchlist menu link", () => {
  it("links to the current user's designated room even when renamed", () => {
    render(<AppMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitem", { name: "Watchlist" }).getAttribute("href"))
      .toBe("/rooms/alices");
    const link = screen.getByRole("menuitem", { name: "Watchlist" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
