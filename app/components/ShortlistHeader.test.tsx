// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppMenu } from "./AppMenu";
import { ShortlistHeader } from "./ShortlistHeader";

vi.mock("./AppMenu", () => ({
  AppMenu: vi.fn(() => <button type="button">Menu</button>),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ShortlistHeader", () => {
  it("renders the home link and menu without theatre context", () => {
    render(<ShortlistHeader />);

    expect(screen.getByRole("link", { name: "Shortlist" }).getAttribute("href"))
      .toBe("/");
    expect(screen.getByRole("button", { name: "Menu" }).closest("header"))
      .toBe(screen.getByRole("link", { name: "Shortlist" }).closest("header"));
    expect(vi.mocked(AppMenu).mock.calls[0][0]).toEqual({});
  });

  it.each([false, true])("preserves theatre menu options (showMyTheatres=%s)", (showMyTheatres) => {
    const theatre = { id: "theatre" };
    render(<ShortlistHeader theatre={theatre} showMyTheatres={showMyTheatres} />);

    expect(vi.mocked(AppMenu).mock.calls[0][0]).toEqual({
      theatre,
      showMyTheatres,
    });
  });
});
