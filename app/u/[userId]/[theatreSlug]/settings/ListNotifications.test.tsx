// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NotificationSettings } from "@/lib/notifications/settings";
import { ListNotifications } from "./ListNotifications";

const mocks = vi.hoisted(() => ({
  choose: vi.fn(),
  retry: vi.fn(),
  settings: undefined as NotificationSettings | undefined,
}));

vi.mock("@/app/lib/api", () => ({
  api: { theatre: () => ({ notifications: { choose: mocks.choose } }) },
}));
vi.mock("@/app/lib/data/queries", () => ({
  useNotificationSettings: () => ({
    data: mocks.settings,
    error: undefined,
    retry: mocks.retry,
  }),
}));
vi.mock("../TheatreContext", () => ({
  useTheatre: () => ({
    theatre: { id: "club", description: "Friday picks #movieclub" },
  }),
}));

beforeEach(() => {
  mocks.choose.mockReset().mockResolvedValue(undefined);
  mocks.retry.mockReset().mockResolvedValue(undefined);
  mocks.settings = {
    enabled: true,
    configured: true,
    newMovies: true,
    extensions: { movieclub: { lead: false, reminder: true } },
  };
});
afterEach(cleanup);

const choice = (name: string) =>
  screen.getByRole("checkbox", { name }) as HTMLInputElement;

it("shows the list's categories and saves a change", async () => {
  render(<ListNotifications />);
  expect(choice("New movies").checked).toBe(true);
  expect(choice("Your movie takes the lead").checked).toBe(false);
  expect(choice("Nomination reminder").checked).toBe(true);

  fireEvent.click(choice("Nomination reminder"));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalled());
  expect(mocks.choose).toHaveBeenCalledWith({
    extensions: { movieclub: { reminder: false } },
  });
});

it("waits for the bell before letting members choose", () => {
  mocks.settings = { ...mocks.settings!, enabled: false };
  render(<ListNotifications />);
  expect(
    screen.getByText("Turn on notifications with the bell", { exact: false }),
  ).toBeTruthy();
  expect(choice("New movies").disabled).toBe(true);
  expect(choice("Your movie takes the lead").disabled).toBe(true);
});

it("treats settings cached before categories existed as all on", () => {
  mocks.settings = { enabled: true, configured: true } as NotificationSettings;
  render(<ListNotifications />);
  expect(choice("New movies").checked).toBe(true);
  expect(choice("Your movie takes the lead").checked).toBe(true);
});

it("shows why a change didn't save", async () => {
  mocks.choose.mockRejectedValue(new Error("Turn on notifications first."));
  render(<ListNotifications />);
  fireEvent.click(choice("New movies"));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Turn on notifications first.",
  );
});
