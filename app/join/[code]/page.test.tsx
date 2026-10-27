// @vitest-environment jsdom

import { Suspense } from "react";
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
import JoinPage from "./page";

const session = vi.hoisted(() => ({
  userId: undefined as string | undefined,
  isPending: false,
  error: null as { message: string } | null,
  retry: vi.fn(),
}));
const actions = vi.hoisted(() => ({
  join: vi.fn(),
  router: { replace: vi.fn() },
}));

vi.mock("@/app/lib/data/DataProvider", () => ({
  useDataSession: () => session,
}));
vi.mock("@/app/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/lib/api")>()),
  api: { join: actions.join },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => actions.router,
}));
vi.mock("./PublicTheatreContainer", () => ({
  PublicTheatreContainer: ({ inviteCode }: { inviteCode: string }) => (
    <div>Preview: {inviteCode}</div>
  ),
}));

const page = (params: Promise<{ code: string }>) => (
  <Suspense fallback={<div>Loading page</div>}>
    <JoinPage params={params} />
  </Suspense>
);
const show = async (code = "member-link") => {
  const params = Promise.resolve({ code });
  const view = await act(async () => render(page(params)));
  return { ...view, params };
};

beforeEach(() => {
  vi.resetAllMocks();
  session.userId = undefined;
  session.isPending = false;
  session.error = null;
  actions.join.mockResolvedValue({ path: "/theatres/club", name: "Club" });
});
afterEach(cleanup);

describe("join page session routing", () => {
  it("waits for the session before previewing or joining", async () => {
    session.isPending = true;
    await show();
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Loading...",
    );
    expect(screen.queryByText(/Preview:/)).toBeNull();
    expect(actions.join).not.toHaveBeenCalled();
  });

  it.each(["member-link", "admin-link"])(
    "shows the signed-out preview for %s without joining or redirecting",
    async (code) => {
      await show(code);
      expect(screen.getByText(`Preview: ${code}`)).toBeDefined();
      expect(actions.join).not.toHaveBeenCalled();
      expect(actions.router.replace).not.toHaveBeenCalled();
    },
  );

  it.each(["member-link", "admin-link"])(
    "joins signed-in visitors through %s and redirects",
    async (code) => {
      session.userId = "alice";
      await show(code);
      await waitFor(() =>
        expect(actions.router.replace).toHaveBeenCalledWith("/theatres/club"),
      );
      expect(actions.join).toHaveBeenCalledExactlyOnceWith(code);
      expect(screen.queryByText(/Preview:/)).toBeNull();
    },
  );

  it("joins when a visitor signs in while the preview is open", async () => {
    const { rerender, params } = await show();
    expect(screen.getByText("Preview: member-link")).toBeDefined();
    session.userId = "alice";
    rerender(page(params));
    await waitFor(() =>
      expect(actions.router.replace).toHaveBeenCalledWith("/theatres/club"),
    );
    expect(actions.join).toHaveBeenCalledExactlyOnceWith("member-link");
  });

  it("shows session errors with retry instead of previewing or joining", async () => {
    session.error = { message: "Session unavailable" };
    await show();
    expect(screen.getByRole("alert").textContent).toContain(
      "Session unavailable",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(session.retry).toHaveBeenCalledOnce();
    expect(actions.join).not.toHaveBeenCalled();
    expect(screen.queryByText(/Preview:/)).toBeNull();
  });

  it.each([
    new Error("Unable to join that theatre."),
    new ApiError("That invite link is no longer valid.", 404),
    new ApiError("Please sign in.", 401),
  ])(
    "shows join errors rather than redirecting or falling back to a preview",
    async (error) => {
      session.userId = "alice";
      actions.join.mockRejectedValue(error);
      await show();
      expect(await screen.findByText(error.message)).toBeDefined();
      expect(screen.getByRole("heading").textContent).toBe(
        "That link did not work",
      );
      expect(actions.router.replace).not.toHaveBeenCalled();
      expect(screen.queryByText(/Preview:/)).toBeNull();
    },
  );

  it("ignores a join response after the visitor leaves", async () => {
    session.userId = "alice";
    let resolve!: (value: { path: string }) => void;
    actions.join.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = await show();
    unmount();
    await act(async () => resolve({ path: "/theatres/club" }));
    expect(actions.router.replace).not.toHaveBeenCalled();
  });
});
