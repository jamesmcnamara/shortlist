// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Trivia } from "./Trivia";
import { MovieDetail } from "./MovieDetail";
import { MovieDiscussion } from "./MovieDiscussion/MovieDiscussion";
import { nomination } from "@/app/lib/fantasy-fixtures";

vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const trivia = {
  url: "https://www.imdb.com/title/tt0133093/trivia/",
  fetchedAt: "2026-01-01T00:00:00Z",
  items: ["A behind-the-scenes fact.", "<img src=x onerror=alert(1)>"],
};
const nominated = nomination(1, "maya", "Test Movie", "2026-01-01", null);
const movie = {
  ...nominated.movie,
  details: { ...nominated.movie.details, genres: [], trivia },
};
afterEach(cleanup);

describe("trivia disclosure", () => {
  it("starts collapsed, warns about spoilers and keeps external text inert", () => {
    const { container } = render(<Trivia trivia={trivia} />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(screen.getByText("(may contain spoilers)")).toBeTruthy();
    fireEvent.click(container.querySelector("summary")!);
    expect(details.open).toBe(true);
    expect(screen.getByText("A behind-the-scenes fact.")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText(trivia.items[1])).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "IMDb trivia" }).getAttribute("href"),
    ).toBe(trivia.url);
    expect(screen.getByText(/^2 entries, fetched/)).toBeTruthy();
  });

  it("distinguishes never-loaded trivia from a successful empty lookup", () => {
    const view = render(<Trivia />);
    expect(screen.getByText(/hasn't been loaded/)).toBeTruthy();
    view.rerender(<Trivia trivia={{ ...trivia, items: [] }} />);
    expect(screen.getByText("No IMDb trivia found.")).toBeTruthy();
    expect(screen.queryByText(/hasn't been loaded/)).toBeNull();
  });

  it("appears in movie details without adding a signed-out refresh action", () => {
    render(<MovieDetail movie={movie} onBack={vi.fn()} />);
    expect(screen.getByText("A behind-the-scenes fact.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh movie" })).toBeNull();
  });

  it("appears in movie discussions", () => {
    render(
      <MovieDiscussion
        nomination={{ ...nominated, movie }}
        hasSeen={false}
        currentUserId={null}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("A behind-the-scenes fact.")).toBeTruthy();
  });
});
