// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MDBRating } from "@/src/db/schema";
import { Ratings } from "./Ratings";

afterEach(cleanup);

const imdb: MDBRating = {
  source: "imdb",
  value: 8.7,
  url: "https://www.imdb.com/title/tt0133093/",
  score: null,
  votes: null,
};
const wikipediaUrl = "https://en.wikipedia.org/wiki/The_Matrix";

describe("Ratings Wikipedia link", () => {
  it("shows the icon alongside existing ratings", () => {
    render(<Ratings services={[imdb]} wikipediaUrl={wikipediaUrl} />);
    expect(screen.getByText("8.7/10")).toBeTruthy();
    const link = screen.getByRole("link", {
      name: "Read about this movie on Wikipedia",
    });
    expect(link.getAttribute("href")).toBe(wikipediaUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("title")).toBe("Wikipedia");
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      "/ratings/wikipedia.svg",
    );
    expect(link.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("shows Wikipedia even when no ratings are available", () => {
    render(<Ratings services={[]} wikipediaUrl={wikipediaUrl} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("preserves ratings without a Wikipedia URL", () => {
    render(<Ratings services={[imdb]} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByTitle("Wikipedia")).toBeNull();
  });

  it("renders nothing when ratings and Wikipedia are missing", () => {
    const { container } = render(<Ratings services={[]} wikipediaUrl={null} />);
    expect(container.childElementCount).toBe(0);
  });
});
