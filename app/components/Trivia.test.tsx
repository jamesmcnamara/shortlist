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
  items: [
    { text: "A behind-the-scenes fact.", spoiler: false },
    { text: "<img src=x onerror=alert(1)>", spoiler: false },
  ],
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
    expect(screen.getByText(trivia.items[1].text)).toBeTruthy();
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
    view.rerender(
      <Trivia
        trivia={{ ...trivia, items: [{ text: "One fact.", spoiler: false }] }}
      />,
    );
    expect(screen.getByText("1 entry")).toBeTruthy();
  });

  it("shows non-spoilers first and requires a separate click to reveal spoilers", () => {
    const { container } = render(
      <Trivia
        trivia={{
          ...trivia,
          items: [
            { text: "The ending.", spoiler: true },
            { text: "A filming location.", spoiler: false },
            { text: "<img src=x onerror=alert(1)>", spoiler: true },
            { text: "A casting fact.", spoiler: false },
          ],
        }}
      />,
    );
    fireEvent.click(container.querySelector("summary")!);
    const spoilerSummary = screen.getByText("Spoilers (2)");
    const spoilerDetails = spoilerSummary.closest("details")!;
    expect(spoilerDetails.open).toBe(false);
    expect(
      Array.from(
        container.querySelector("details > ul")!.children,
        (item) => item.textContent,
      ),
    ).toEqual(["A filming location.", "A casting fact."]);
    expect(screen.getByText("The ending.").closest("details")).toBe(
      spoilerDetails,
    );
    fireEvent.click(spoilerSummary);
    expect(spoilerDetails.open).toBe(true);
    expect(
      screen.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "A filming location.",
      "A casting fact.",
      "The ending.",
      "<img src=x onerror=alert(1)>",
    ]);
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(spoilerSummary);
    expect(spoilerDetails.open).toBe(false);
  });

  it("keeps an all-spoiler collection hidden without calling it empty", () => {
    const { container } = render(
      <Trivia
        trivia={{
          ...trivia,
          items: [{ text: "The ending.", spoiler: true }],
        }}
      />,
    );
    fireEvent.click(container.querySelector("summary")!);
    expect(screen.getByText("The ending.").closest("details")!.open).toBe(
      false,
    );
    expect(screen.queryByText("No IMDb trivia found.")).toBeNull();
    fireEvent.click(screen.getByText("Spoilers (1)"));
    expect(screen.getByRole("listitem").textContent).toBe("The ending.");
  });

  it("does not offer a spoiler disclosure when every entry is safe", () => {
    const { container } = render(<Trivia trivia={trivia} />);
    expect(container.querySelectorAll("details")).toHaveLength(1);
  });

  it("collapses spoilers when switching to another movie", () => {
    const items = [{ text: "The ending.", spoiler: true }];
    const { container, rerender } = render(
      <Trivia trivia={{ ...trivia, items }} />,
    );
    fireEvent.click(container.querySelector("summary")!);
    fireEvent.click(screen.getByText("Spoilers (1)"));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    rerender(
      <Trivia
        trivia={{
          ...trivia,
          url: "https://www.imdb.com/title/tt0816692/trivia/",
          items,
        }}
      />,
    );
    expect(screen.getByText("Spoilers (1)").closest("details")!.open).toBe(
      false,
    );
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

  it.each(["details", "discussion"])(
    "keeps the sticky trivia header opaque and matched to its %s panel",
    async (context) => {
      const { container } = render(
        context === "details" ? (
          <MovieDetail movie={movie} onBack={vi.fn()} />
        ) : (
          <MovieDiscussion
            nomination={{ ...nominated, movie }}
            hasSeen={false}
            currentUserId={null}
            onClose={vi.fn()}
          />
        ),
      );
      const panel =
        context === "details"
          ? container.firstElementChild!
          : screen.getByRole("region", {
              name: `Discussion about ${movie.details.title}`,
            });
      const summary = container.querySelector("details > summary")!;
      fireEvent.click(summary);

      await waitFor(() => {
        const header = getComputedStyle(summary);
        expect(header.position).toBe("sticky");
        expect(header.background).not.toBe("transparent");
        expect(header.background).toBe(getComputedStyle(panel).background);
      });
    },
  );
});
