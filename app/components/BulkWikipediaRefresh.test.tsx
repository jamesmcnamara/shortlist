// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/app/lib/api";
import { AppMenu } from "./AppMenu";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  refresh: vi.fn(),
  boxOffice: vi.fn(),
  theatre: vi.fn(),
  signedIn: true,
}));

vi.mock("@/app/lib/api", async (original) => ({
  ...(await original<typeof import("@/app/lib/api")>()),
  api: { theatre: mocks.theatre },
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({
      data: mocks.signedIn ? { user: { id: "user", name: "User" } } : null,
    }),
  },
}));
vi.mock("@/app/lib/data/queries", () => ({
  useTheatres: () => ({ data: [] }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

beforeEach(() => {
  mocks.signedIn = true;
  mocks.list.mockReset().mockResolvedValue([
    { movieId: 1, completedAt: null },
    { movieId: 2, completedAt: "2026-01-01" },
    { movieId: 1, completedAt: null },
  ]);
  mocks.refresh.mockReset().mockResolvedValue({ wikipediaUrl: null });
  mocks.boxOffice.mockReset();
  mocks.theatre.mockReset().mockReturnValue({
    nominations: { list: mocks.list },
    refreshWikipedia: mocks.refresh,
    refreshBoxOffice: mocks.boxOffice,
  });
});
afterEach(cleanup);

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
const start = () => {
  openMenu();
  fireEvent.click(screen.getByRole("button", { name: "Extra Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh Wikipedia" }));
};
const menu = () => render(<AppMenu theatre={{ id: "current-theatre" }} />);
const completed = () =>
  waitFor(() =>
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    ),
  );

describe("bulk Wikipedia refresh", () => {
  it("checks unique movies including Watched without running the box-office action", async () => {
    menu();
    start();
    expect(screen.queryByRole("menu")).toBeNull();
    await completed();
    expect(mocks.theatre).toHaveBeenCalledWith("current-theatre");
    expect(mocks.refresh.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(mocks.boxOffice).not.toHaveBeenCalled();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "Wikipedia: 2 movies checked, 0 failed",
    );
  });

  it("dismisses and reopens progress without starting another batch", async () => {
    let finish!: () => void;
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    menu();
    start();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss Wikipedia progress" }),
    );
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    openMenu();
    fireEvent.click(
      screen.getByRole("button", { name: "Show Wikipedia progress" }),
    );
    expect(mocks.list).toHaveBeenCalledOnce();
    await act(async () => finish());
    await completed();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("continues after lookup failures and reports the failure count", async () => {
    mocks.refresh.mockRejectedValueOnce(
      new ApiError("Wikidata unavailable", 502),
    );
    menu();
    start();
    await completed();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toContain(
      "1 movie couldn't be refreshed",
    );
  });

  it("stops when access is lost", async () => {
    mocks.refresh.mockRejectedValueOnce(new ApiError("Sign in again", 401));
    menu();
    start();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sign in again",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("reports list-loading failures and allows retry", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Couldn't load this theatre"));
    menu();
    start();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't load this theatre",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Refresh Wikipedia" }));
    await completed();
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("handles an empty theatre", async () => {
    mocks.list.mockResolvedValue([]);
    menu();
    start();
    await completed();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "No movies to refresh.",
    );
  });

  it("aborts when leaving the page and starts no further requests", async () => {
    let finish!: () => void;
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const view = menu();
    start();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    const signal = mocks.refresh.mock.calls[0][1] as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish());
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not offer the action outside a theatre", () => {
    render(<AppMenu />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Extra Settings" }));
    expect(
      screen.queryByRole("button", { name: "Refresh Wikipedia" }),
    ).toBeNull();
  });

  it("does not offer the action to signed-out visitors", () => {
    mocks.signedIn = false;
    menu();
    openMenu();
    expect(
      screen.queryByRole("button", { name: "Refresh Wikipedia" }),
    ).toBeNull();
  });
});
