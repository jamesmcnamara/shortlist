// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/app/lib/api";
import type { Movie } from "@/src/db/schema";
import { MovieRefresh } from "./MovieRefresh";
import { MovieDetail } from "./MovieDetail";
import { MovieDiscussion } from "./MovieDiscussion/MovieDiscussion";
import { nomination } from "@/app/lib/fantasy-fixtures";
import loadingStyles from "./LoadingOverlay.module.css";

const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: session.signedIn ? { user: { id: "user" } } : null,
    }),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const nominated = nomination(1, "maya", "Before refresh", "2026-01-01", null);
const movie = {
  ...nominated.movie,
  details: { ...nominated.movie.details, genres: [] },
};

function start(element: Element, touches = [{ clientX: 100, clientY: 100 }]) {
  fireEvent.touchStart(element, {
    touches: touches.map((touch) => ({
      ...touch,
      pageX: touch.clientX,
      pageY: touch.clientY,
    })),
  });
}

function move(element: Element, x: number, y: number) {
  return fireEvent.touchMove(element, {
    touches: [{ clientX: x, clientY: y, pageX: x, pageY: y }],
    cancelable: true,
  });
}

function pull(element: Element, distance = 100) {
  start(element);
  move(element, 100, 100 + distance);
  fireEvent.touchEnd(element);
}

beforeEach(() => {
  session.signedIn = true;
  document.documentElement.scrollTop = 0;
  document.documentElement.style.overflowY = "auto";
});
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty("overflow-y");
  vi.restoreAllMocks();
});

describe("shared movie pull-to-refresh", () => {
  it("keeps content but ignores gestures and keyboard refresh while signed out", () => {
    session.signedIn = false;
    const refresh = vi.spyOn(api.movies, "refresh");
    render(<MovieRefresh movieId={1}>Movie content</MovieRefresh>);
    const content = screen.getByText("Movie content");
    pull(content);
    fireEvent.keyDown(content.closest("[aria-busy]")!, { key: "Enter" });
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows release feedback, refreshes only on release and prevents duplicate requests", async () => {
    let finish!: (value: { movie: Movie; failed: string[] }) => void;
    const refresh = vi.spyOn(api.movies, "refresh").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onRefreshed = vi.fn();
    render(
      <MovieRefresh movieId={1} onRefreshed={onRefreshed}>
        Movie content
      </MovieRefresh>,
    );
    const content = screen.getByText("Movie content");
    start(content);
    expect(move(content, 100, 130)).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
    move(content, 100, 180);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.touchEnd(content);
    expect(refresh).toHaveBeenCalledExactlyOnceWith(1);
    expect(
      screen.getByRole("status", { name: "Refreshing movie..." }).className,
    ).toContain(loadingStyles.translucent);
    expect(screen.queryByText("Release to refresh")).toBeNull();
    const wrapper = content.closest("[aria-busy]")!;
    expect(wrapper.getAttribute("aria-busy")).toBe("true");
    pull(content);
    fireEvent.keyDown(wrapper, { key: "Enter" });
    expect(refresh).toHaveBeenCalledOnce();
    finish({ movie, failed: [] });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(onRefreshed).toHaveBeenCalledWith(movie);
    expect(wrapper.getAttribute("aria-busy")).toBe("false");
  });

  it.each([
    ["short", 100, 179],
    ["upward", 100, 0],
  ])("ignores %s gestures", (_name, x, y) => {
    const refresh = vi.spyOn(api.movies, "refresh");
    render(<MovieRefresh movieId={1}>Movie content</MovieRefresh>);
    const content = screen.getByText("Movie content");
    start(content);
    move(content, x, y);
    fireEvent.touchEnd(content);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses the library's threshold: crossing it arms refresh until release", async () => {
    const refresh = vi.spyOn(api.movies, "refresh").mockResolvedValue({
      movie,
      failed: [],
    });
    render(<MovieRefresh movieId={1}>Movie content</MovieRefresh>);
    const content = screen.getByText("Movie content");
    start(content);
    move(content, 100, 210);
    move(content, 100, 140);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.touchEnd(content);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("ignores pulls that start partway down the document", () => {
    const refresh = vi.spyOn(api.movies, "refresh");
    document.documentElement.scrollTop = 50;
    render(<MovieRefresh movieId={1}>Movie content</MovieRefresh>);
    const content = screen.getByText("Movie content");
    start(content);
    document.documentElement.scrollTop = 0;
    move(content, 100, 210);
    fireEvent.touchEnd(content);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("respects the drawer scroll boundary while the background page is locked", async () => {
    const refresh = vi.spyOn(api.movies, "refresh").mockResolvedValue({
      movie,
      failed: [],
    });
    render(
      <div data-testid="drawer" style={{ overflowY: "auto" }}>
        <MovieRefresh movieId={1}>Movie content</MovieRefresh>
      </div>,
    );
    const drawer = screen.getByTestId("drawer");
    const content = screen.getByText("Movie content");
    drawer.scrollTop = 40;
    pull(content);
    expect(refresh).not.toHaveBeenCalled();
    drawer.scrollTop = 0;
    document.documentElement.scrollTop = 200;
    document.documentElement.style.overflowY = "hidden";
    pull(content);
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });

  it("does not start on controls or with multiple fingers", () => {
    const refresh = vi.spyOn(api.movies, "refresh");
    render(
      <MovieRefresh movieId={1}>
        <p>Movie content</p>
        <button>Close</button>
        <textarea aria-label="Comment" />
      </MovieRefresh>,
    );
    const content = screen.getByText("Movie content");
    start(content, [
      { clientX: 100, clientY: 100 },
      { clientX: 120, clientY: 100 },
    ]);
    move(content, 100, 210);
    fireEvent.touchEnd(content);
    pull(screen.getByRole("button", { name: "Close" }));
    pull(screen.getByRole("textbox"));
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("preserves desktop mouse dragging for text selection", () => {
    const refresh = vi.spyOn(api.movies, "refresh");
    render(<MovieRefresh movieId={1}>Movie content</MovieRefresh>);
    const content = screen.getByText("Movie content");
    fireEvent.mouseDown(content, { clientY: 100 });
    fireEvent.mouseMove(content, { clientY: 210 });
    fireEvent.mouseUp(content);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("preserves selected text instead of treating its drag as refresh", () => {
    const refresh = vi.spyOn(api.movies, "refresh");
    render(
      <MovieRefresh movieId={1}>
        <p>Movie content</p>
      </MovieRefresh>,
    );
    const content = screen.getByText("Movie content");
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(content);
    selection.addRange(range);
    pull(content);
    selection.removeAllRanges();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows partial failures while applying successful updates, then allows a keyboard retry", async () => {
    const refresh = vi
      .spyOn(api.movies, "refresh")
      .mockResolvedValueOnce({ movie, failed: ["IMDb trivia"] })
      .mockResolvedValue({ movie, failed: [] });
    const onRefreshed = vi.fn();
    render(
      <MovieRefresh movieId={1} onRefreshed={onRefreshed}>
        Movie content
      </MovieRefresh>,
    );
    const content = screen.getByText("Movie content");
    pull(content);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Couldn't refresh IMDb trivia",
    );
    expect(onRefreshed).toHaveBeenCalledWith(movie);
    fireEvent.keyDown(content.closest("[aria-busy]")!, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("surfaces request failures without applying a fake update", async () => {
    vi.spyOn(api.movies, "refresh").mockRejectedValue(
      new Error("Network unavailable"),
    );
    const onRefreshed = vi.fn();
    render(
      <MovieRefresh movieId={1} onRefreshed={onRefreshed}>
        Movie content
      </MovieRefresh>,
    );
    pull(screen.getByText("Movie content"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Network unavailable",
    );
    expect(onRefreshed).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("updates detail content even when only some integrations succeed", async () => {
    vi.spyOn(api.movies, "refresh").mockResolvedValue({
      movie: {
        ...movie,
        details: {
          ...movie.details,
          title: "After refresh",
          trivia: {
            url: "https://www.imdb.com/title/tt0133093/trivia/",
            fetchedAt: "2026-01-01T00:00:00Z",
            items: ["A new fact."],
          },
        },
      },
      failed: ["Box Office Mojo"],
    });
    render(<MovieDetail movie={movie} onBack={vi.fn()} />);
    pull(screen.getByRole("heading", { name: "Before refresh" }));
    expect(
      await screen.findByRole("heading", { name: "After refresh" }),
    ).toBeTruthy();
    expect(screen.getByText("A new fact.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Refresh movie" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Box Office Mojo");
  });

  it("refreshes discussions without triggering close or nomination actions", async () => {
    const refresh = vi.spyOn(api.movies, "refresh").mockResolvedValue({
      movie,
      failed: [],
    });
    const onClose = vi.fn();
    const onMarkWatched = vi.fn();
    render(
      <MovieDiscussion
        nomination={{ ...nominated, movie }}
        hasSeen={false}
        currentUserId="user"
        onClose={onClose}
        onMarkWatched={onMarkWatched}
      />,
    );
    pull(screen.getByRole("heading", { name: "Before refresh" }));
    await waitFor(() =>
      expect(refresh).toHaveBeenCalledExactlyOnceWith(nominated.movieId),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onMarkWatched).not.toHaveBeenCalled();
  });

  it("does not dismiss a discussion when its fullscreen loader is touched", async () => {
    let finish!: (value: { movie: Movie; failed: string[] }) => void;
    vi.spyOn(api.movies, "refresh").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <MovieDiscussion
        nomination={{ ...nominated, movie }}
        hasSeen={false}
        currentUserId="user"
        onClose={onClose}
      />,
    );
    pull(screen.getByRole("heading", { name: "Before refresh" }));
    fireEvent.pointerDown(
      screen.getByRole("status", { name: "Refreshing movie..." }),
    );
    expect(onClose).not.toHaveBeenCalled();
    finish({ movie, failed: [] });
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Refreshing movie..." }),
      ).toBeNull(),
    );
  });
});
