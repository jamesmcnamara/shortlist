// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppMenu } from "./AppMenu";

const data = vi.hoisted(() => ({
  disconnect: vi.fn(),
  signOut: vi.fn(),
  userId: "alice",
  theatres: [
    { id: "ordinary", name: "Watchlist", watchlistFor: null },
    { id: "bobs", name: "Watchlist", watchlistFor: "bob" },
    { id: "alices", name: "Renamed movies", watchlistFor: "alice" },
  ],
}));

vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: data.userId, name: "Alice" } } }),
    signOut: data.signOut,
  },
}));
vi.mock("@/app/lib/push", () => ({
  disconnectDeviceNotifications: data.disconnect,
}));
vi.mock("@/app/lib/data/queries", () => ({
  useTheatres: () => ({ data: data.theatres }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("watchlist menu link", () => {
  it("links to the user's theatres", () => {
    render(<AppMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(
      screen.getByRole("menuitem", { name: "Theatres Near You" }).getAttribute("href"),
    ).toBe("/theatres");
  });

  it("links to the current user's designated theatre even when renamed", () => {
    render(<AppMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(screen.getByRole("menuitem", { name: "Watchlist" }).getAttribute("href"))
      .toBe("/theatres/alices");
    const link = screen.getByRole("menuitem", { name: "Watchlist" });
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("disconnects this device before signing out", async () => {
    render(<AppMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Extra Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(data.signOut).toHaveBeenCalledOnce());
    expect(data.disconnect).toHaveBeenCalledOnce();
    expect(data.disconnect.mock.invocationCallOrder[0]).toBeLessThan(data.signOut.mock.invocationCallOrder[0]);
  });

  it("shows an error instead of leaving notifications attached to a signed-out browser", async () => {
    data.disconnect.mockRejectedValue(new Error("Network unavailable"));
    render(<AppMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Extra Settings" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Unable to sign out safely.");
    expect(data.signOut).not.toHaveBeenCalled();
  });
});
