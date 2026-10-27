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
  theatre: vi.fn(),
}));

vi.mock("@/app/lib/api", async (original) => ({
  ...(await original<typeof import("@/app/lib/api")>()),
  api: { theatre: mocks.theatre },
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user", name: "User" } } }),
  },
}));
vi.mock("@/app/lib/data/queries", () => ({
  useTheatres: () => ({ data: [] }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([
    { movieId: 1, completed: false },
    { movieId: 2, completed: true },
    { movieId: 1, completed: true },
  ]);
  mocks.refresh.mockReset().mockResolvedValue({});
  mocks.theatre.mockReset().mockReturnValue({
    nominations: { list: mocks.list },
    refreshBoxOffice: mocks.refresh,
  });
});
afterEach(cleanup);

const openMenu = () =>
  fireEvent.click(screen.getByRole("button", { name: "Menu" }));
const start = () => {
  openMenu();
  fireEvent.click(screen.getByRole("button", { name: "Extra Settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh box office" }));
};
const menu = () => render(<AppMenu theatre={{ id: "current-theatre" }} />);

describe("bulk box office refresh", () => {
  it("runs once per movie, including Watched, and survives closing the menu", async () => {
    menu();
    start();
    expect(screen.queryByRole("menu")).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByRole("progressbar").getAttribute("aria-valuenow"),
      ).toBe("100"),
    );
    expect(mocks.theatre).toHaveBeenCalledWith("current-theatre");
    expect(mocks.refresh.mock.calls.map(([id]) => id)).toEqual([1, 2]);
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuetext"),
    ).toContain("2 movies checked, 0 failed");
  });

  it("shows real sequential progress and can be dismissed and reopened without starting another job", async () => {
    let finish!: () => void;
    mocks.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    menu();
    start();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss box office progress" }),
    );
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    openMenu();
    fireEvent.click(
      screen.getByRole("button", { name: "Show box office progress" }),
    );
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledOnce();
    await act(async () => {
      finish();
    });
    await waitFor(() =>
      expect(
        screen.getByRole("progressbar").getAttribute("aria-valuenow"),
      ).toBe("100"),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("continues after an individual failure and reports it instead of claiming complete success", async () => {
    mocks.refresh.mockRejectedValueOnce(new ApiError("No IMDb ID", 400));
    menu();
    start();
    await waitFor(() =>
      expect(
        screen.getByRole("progressbar").getAttribute("aria-valuenow"),
      ).toBe("100"),
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert").textContent).toContain(
      "1 movie couldn't be refreshed",
    );
  });

  it("stops if access is lost", async () => {
    mocks.refresh.mockRejectedValueOnce(new ApiError("Access denied", 401));
    menu();
    start();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Access denied"),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("reports a list-loading error and supports retry from the menu", async () => {
    mocks.list.mockRejectedValueOnce(new Error("Couldn't load this theatre"));
    menu();
    start();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't load this theatre",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Refresh box office" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("handles an empty theatre without requests or a stuck progress bar", async () => {
    mocks.list.mockResolvedValue([]);
    menu();
    start();
    await screen.findByText("No movies to refresh.", {
      selector: "p:not(.srOnly)",
    });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("aborts the current request and starts no more when leaving the page", async () => {
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
    await act(async () => {
      finish();
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("does not offer bulk refresh outside a theatre", () => {
    render(<AppMenu />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Extra Settings" }));
    expect(
      screen.queryByRole("button", { name: "Refresh box office" }),
    ).toBeNull();
  });
});
