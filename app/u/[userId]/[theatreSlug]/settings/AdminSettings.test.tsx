// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminSettings } from "./AdminSettings";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  push: vi.fn(),
  username: "bob" as string | undefined,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { username: mocks.username } } }),
  },
}));
vi.mock("../TheatreContext", () => ({
  useTheatre: () => ({
    theatre: { id: "club", name: "Club", path: "/u/@alice/club" },
    client: { delete: mocks.remove },
    detail: { members: [] },
  }),
}));

beforeEach(() => {
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.push.mockReset();
  mocks.username = "bob";
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const deleteTheatre = () => {
  render(<AdminSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Delete this theatre" }));
};

it("returns to the viewer's profile, not the creator's, after deletion", async () => {
  deleteTheatre();
  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/u/@bob"));
  expect(mocks.remove).toHaveBeenCalledOnce();
});

it("does not delete when the confirmation is cancelled", () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  deleteTheatre();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("shows deletion errors and stays on settings", async () => {
  mocks.remove.mockRejectedValue(new Error("Unable to delete."));
  deleteTheatre();
  expect(await screen.findByText("Unable to delete.")).toBeTruthy();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("does not delete if the viewer has no canonical destination", () => {
  mocks.username = undefined;
  deleteTheatre();
  expect(
    screen.getByText("A user handle is required for profile links."),
  ).toBeTruthy();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
});
