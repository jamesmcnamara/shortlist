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
  update: vi.fn(),
  push: vi.fn(),
  username: "bob" as string | undefined,
  description: null as string | null,
  defaultSort: null as string | null,
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
    theatre: {
      id: "club",
      name: "Club",
      path: "/u/@alice/club",
      description: mocks.description,
      defaultSort: mocks.defaultSort,
    },
    client: { delete: mocks.remove, update: mocks.update },
    detail: { members: [] },
  }),
}));

beforeEach(() => {
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.push.mockReset();
  mocks.username = "bob";
  mocks.description = null;
  mocks.defaultSort = null;
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

it("offers the list's available sorts and saves the chosen default", async () => {
  mocks.description = "#movieclub";
  mocks.defaultSort = "votes";
  render(<AdminSettings />);
  const sort = screen.getByRole("combobox", { name: "Default sort" });
  expect((sort as HTMLSelectElement).value).toBe("votes");
  expect(screen.getByRole("option", { name: "Most upvotes" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Letterboxd" })).toBeTruthy();
  expect(
    screen.getByRole("option", { name: "Return multiplier" }),
  ).toBeTruthy();
  fireEvent.change(sort, { target: { value: "title" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved.");
  expect(mocks.update).toHaveBeenCalledWith({
    name: "Club",
    defaultSort: "title",
  });
});

it("omits unavailable extension sorts and saves App default as null", async () => {
  mocks.defaultSort = "votes";
  render(<AdminSettings />);
  const sort = screen.getByRole("combobox", { name: "Default sort" });
  expect((sort as HTMLSelectElement).value).toBe("");
  expect(screen.queryByRole("option", { name: "Most upvotes" })).toBeNull();
  fireEvent.change(sort, { target: { value: "title" } });
  fireEvent.change(sort, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved.");
  expect(mocks.update).toHaveBeenCalledWith({
    name: "Club",
    defaultSort: null,
  });
});

it("keeps the selection and shows an error when saving fails", async () => {
  mocks.update.mockRejectedValue(new Error("Unable to save."));
  render(<AdminSettings />);
  const sort = screen.getByRole("combobox", { name: "Default sort" });
  fireEvent.change(sort, { target: { value: "title" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Unable to save.")).toBeTruthy();
  expect((sort as HTMLSelectElement).value).toBe("title");
  expect(screen.queryByText("Saved.")).toBeNull();
});

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
