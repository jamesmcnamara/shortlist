// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BoxOffice } from "./BoxOffice";
import type { BoxOfficeData } from "@/app/lib/box-office";

afterEach(cleanup);
const data: BoxOfficeData = {
  source: "boxofficemojo",
  url: "https://www.boxofficemojo.com/title/tt0816692/",
  fetchedAt: "2026-10-16T00:00:00Z",
  currency: "USD",
  budget: 10_000_000,
  worldwideGross: 25_999_999,
  domesticGross: null,
  internationalGross: null,
};

describe("financial row", () => {
  it("shows compact values, net return, attribution, and a profit caveat", () => {
    render(<BoxOffice data={data} />);
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent === "Made $15.9m (1.59x) on $10m",
      ),
    ).toBeTruthy();
    expect(screen.getByText("$15.9m")).toBeTruthy();
    expect(screen.getByText("1.59x")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Box Office Mojo" })
        .getAttribute("href"),
    ).toBe(data.url);
    expect(screen.getByText(/not studio profit/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("doesn't replace missing Mojo data with TMDB numbers", () => {
    render(<BoxOffice />);
    expect(screen.getByText("No box office data")).toBeTruthy();
    expect(screen.queryByText(/Made|Lost/)).toBeNull();
  });

  it("labels a manual budget without attributing it to Mojo", () => {
    render(
      <BoxOffice
        data={{
          ...data,
          source: "manual",
          url: undefined,
          budgetSource: "manual",
          worldwideGross: null,
        }}
      />,
    );
    expect(screen.getByText("Manual budget")).toBeTruthy();
    expect(screen.getByText("$10m")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Box Office Mojo" })).toBeNull();
  });

  it("describes losses without a double negative and keeps inline heat colors", () => {
    render(<BoxOffice data={{ ...data, worldwideGross: 5_000_000 }} />);
    const net = screen.getByText("$5m");
    const multiplier = screen.getByText("-0.5x");
    expect(net.parentElement?.textContent).toBe("Lost $5m (-0.5x) on $10m");
    expect(net.getAttribute("style")).toBe(multiplier.getAttribute("style"));
    expect(net.getAttribute("style")).toContain("color-mix");
    expect(screen.getByText("$10m").getAttribute("style")).toContain(
      "color-mix",
    );
  });

  it("shows break-even and zero-budget returns without dividing by zero", () => {
    const view = render(
      <BoxOffice data={{ ...data, worldwideGross: data.budget }} />,
    );
    expect(screen.getByText("$0").parentElement?.textContent).toBe(
      "Made $0 (0x) on $10m",
    );
    view.rerender(<BoxOffice data={{ ...data, budget: 0 }} />);
    expect(screen.getByText("$25.9m").parentElement?.textContent).toBe(
      "Made $25.9m (\u2013) on $0",
    );
  });
});
