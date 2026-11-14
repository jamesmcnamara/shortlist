// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
  it("starts collapsed and keeps external text inert", () => {
    const { container } = render(<Trivia trivia={trivia} />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
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
    expect(screen.getByText("Show")).toBeTruthy();
    view.rerender(<Trivia trivia={{ ...trivia, items: [] }} />);
    expect(screen.getByText("No IMDb trivia found.")).toBeTruthy();
    expect(screen.getByText("0 entries")).toBeTruthy();
    expect(screen.queryByText(/hasn't been loaded/)).toBeNull();
    view.rerender(<Trivia trivia={{ ...trivia, items: ["One fact."] }} />);
    expect(screen.getByText("1 entry")).toBeTruthy();
  });

  it("swaps the entry count for Collapse while open and closes from its label", async () => {
    const { container } = render(<Trivia trivia={trivia} />);
    const summary = container.querySelector("summary")!;
    const details = container.querySelector("details")!;
    const count = screen.getByText("2 entries");
    expect(getComputedStyle(count).display).not.toBe("none");
    expect(getComputedStyle(screen.getByText("Collapse")).display).toBe("none");
    fireEvent.click(summary);
    await waitFor(() => {
      expect(details.open).toBe(true);
      expect(getComputedStyle(count).display).toBe("none");
      expect(getComputedStyle(screen.getByText("Collapse")).display).toBe(
        "inline",
      );
    });
    fireEvent.click(screen.getByText("Collapse"));
    expect(details.open).toBe(false);
    expect(getComputedStyle(count).display).not.toBe("none");
    expect(container.querySelector("details > summary")).toBe(summary);
  });

  it("appears in movie details without adding a signed-out refresh action", () => {
    render(<MovieDetail movie={movie} onBack={vi.fn()} />);
    expect(screen.getByText("A behind-the-scenes fact.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh movie" })).toBeNull();
    const triviaTitle = getComputedStyle(screen.getByText("Trivia"));
    const sectionTitle = getComputedStyle(
      screen.getByRole("heading", { name: "Ratings" }),
    );
    expect(triviaTitle.color).toBe(sectionTitle.color);
    expect(triviaTitle.fontSize).toBe(sectionTitle.fontSize);
    expect(triviaTitle.fontWeight).toBe(sectionTitle.fontWeight);
    expect(triviaTitle.letterSpacing).toBe(sectionTitle.letterSpacing);
    expect(triviaTitle.textTransform).toBe(sectionTitle.textTransform);
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
    expect(getComputedStyle(screen.getByText("Trivia")).textTransform).not.toBe(
      "uppercase",
    );
  });
});
