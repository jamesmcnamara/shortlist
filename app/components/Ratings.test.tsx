// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MDBRating } from "@/src/db/schema";
import { heat } from "@/app/lib/heat";
import { Ratings } from "./Ratings";

const auth = vi.hoisted(() => ({
  email: null as string | null,
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: auth.email ? { user: { email: auth.email } } : null,
    }),
  },
}));

beforeEach(() => {
  auth.email = null;
});
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
  it("links to the IMDb trivia page", () => {
    render(<Ratings movieTitle="The Matrix" services={[imdb]} />);
    const link = screen.getByRole("link", {
      name: "Read trivia about this movie on IMDb",
    });
    expect(link.getAttribute("href")).toBe(
      "https://www.imdb.com/title/tt0133093/trivia/",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("title")).toBe("IMDb trivia");
  });

  it("shows the icon alongside existing ratings", () => {
    render(
      <Ratings
        movieTitle="The Matrix"
        services={[imdb]}
        wikipediaUrl={wikipediaUrl}
      />,
    );
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
    render(
      <Ratings
        movieTitle="The Matrix"
        services={[]}
        wikipediaUrl={wikipediaUrl}
      />,
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("preserves ratings without a Wikipedia URL", () => {
    render(<Ratings movieTitle="The Matrix" services={[imdb]} />);
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "IMDb: 8.7/10. View on IMDb" }),
    ).toBeTruthy();
    expect(screen.queryByTitle("Wikipedia")).toBeNull();
  });

  it("renders nothing when ratings and Wikipedia are missing", () => {
    const { container } = render(
      <Ratings movieTitle="The Matrix" services={[]} wikipediaUrl={null} />,
    );
    expect(container.childElementCount).toBe(0);
  });
});

describe("Ratings heat map", () => {
  it.each<[MDBRating["source"], number, number]>([
    ["imdb", 4, 0],
    ["imdb", 5.5, 0],
    ["imdb", 6.5, 0.5],
    ["imdb", 7.5, 1],
    ["imdb", 9, 1],
    ["letterboxd", 3.25, 0.25],
    ["tomatoes", 83.75, 0.75],
    ["popcorn", 72.5, 0.5],
  ])("colors %s at %s using the absolute scale", (source, value, score) => {
    render(
      <Ratings
        movieTitle="The Matrix"
        services={[{ ...imdb, source, value }]}
      />,
    );
    const link = screen
      .getAllByRole("link")
      .find((link) => link.getAttribute("href") === imdb.url);
    const expected = document.createElement("span");
    expected.style.background = heat(score);
    expect(link?.style.background).toBe(expected.style.background);
  });

  it("keeps non-rating links uncolored", () => {
    render(
      <Ratings
        movieTitle="The Matrix"
        services={[imdb]}
        wikipediaUrl={wikipediaUrl}
      />,
    );
    expect(screen.getByTitle("IMDb trivia").style.background).toBe("");
    expect(screen.getByTitle("Wikipedia").style.background).toBe("");
  });
});

describe("Ratings 6 Degrees link", () => {
  it("shows an icon-only link for the matching account, even without ratings", () => {
    auth.email = "jamesscottmcnamara@gmail.com";
    const title = "Amélie & WALL·E / 東京? #1";
    render(<Ratings movieTitle={title} services={[]} />);
    const link = screen.getByRole("link", {
      name: `Open ${title} in 6 Degrees`,
    });
    expect(link.getAttribute("href")).toBe(
      `https://p0wd43vp2t.local:3001/open/movie?title=${encodeURIComponent(title)}`,
    );
    expect(link.getAttribute("target")).toBeNull();
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      "/ratings/six-degrees.svg",
    );
    expect(link.textContent).toBe("");
    expect(link.style.background).toBe("");
  });

  it.each([null, "another@example.com"])("hides the link for %s", (email) => {
    auth.email = email;
    render(<Ratings movieTitle="The Matrix" services={[imdb]} />);
    expect(screen.queryByTitle("6 Degrees")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("removes the link when the account changes or signs out", () => {
    auth.email = "jamesscottmcnamara@gmail.com";
    const { rerender } = render(
      <Ratings movieTitle="The Matrix" services={[]} />,
    );
    expect(screen.getByTitle("6 Degrees")).toBeTruthy();
    auth.email = "another@example.com";
    rerender(<Ratings movieTitle="The Matrix" services={[]} />);
    expect(screen.queryByTitle("6 Degrees")).toBeNull();
    auth.email = null;
    rerender(<Ratings movieTitle="The Matrix" services={[]} />);
    expect(screen.queryByTitle("6 Degrees")).toBeNull();
  });
});
