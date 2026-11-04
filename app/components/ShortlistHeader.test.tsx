// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppMenu } from "./AppMenu";
import { ShortlistHeader } from "./ShortlistHeader";

const navigation = vi.hoisted(() => ({
  pathname: "/",
  session: null as { user: { username: string } } | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: navigation.session }) },
}));

vi.mock("./AppMenu", () => ({
  AppMenu: vi.fn(() => <button type="button">Menu</button>),
}));

beforeEach(() => {
  navigation.pathname = "/";
  navigation.session = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShortlistHeader", () => {
  it.each(["/u/@alice", "/u/@bob", "/u/@alice/", "/u/%40alice"])(
    "links to Search from a user's theatres page (%s)",
    (pathname) => {
      navigation.pathname = pathname;
      navigation.session = { user: { username: "alice" } };
      render(<ShortlistHeader />);
      expect(
        screen.getByRole("link", { name: "Shortlist" }).getAttribute("href"),
      ).toBe("/");
    },
  );

  it.each([
    "/",
    "/m/42",
    "/u/@bob/club",
    "/u/@alice/club/settings",
    "/compare",
  ])("links to the logged-in user's theatres from %s", (pathname) => {
    navigation.pathname = pathname;
    navigation.session = { user: { username: "alice" } };
    render(<ShortlistHeader />);
    expect(
      screen.getByRole("link", { name: "Shortlist" }).getAttribute("href"),
    ).toBe("/u/@alice");
  });

  it.each(["/", "/u/@bob/club", "/m/42"])(
    "links to Search when signed out on %s",
    (pathname) => {
      navigation.pathname = pathname;
      render(<ShortlistHeader />);
      expect(
        screen.getByRole("link", { name: "Shortlist" }).getAttribute("href"),
      ).toBe("/");
    },
  );

  it("renders the home link and menu without theatre context", () => {
    render(<ShortlistHeader />);

    expect(
      screen.getByRole("link", { name: "Shortlist" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.getByRole("button", { name: "Menu" }).closest("header")).toBe(
      screen.getByRole("link", { name: "Shortlist" }).closest("header"),
    );
    expect(vi.mocked(AppMenu).mock.calls[0][0]).toEqual({});
  });

  it("passes additional actions to the menu", () => {
    const additionalMenuItems = [
      { type: "button" as const, label: "Import Movies", onClick: vi.fn() },
    ];
    render(<ShortlistHeader additionalMenuItems={additionalMenuItems} />);
    expect(vi.mocked(AppMenu).mock.calls[0][0]).toEqual({
      additionalMenuItems,
    });
  });
});
