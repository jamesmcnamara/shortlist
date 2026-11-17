// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shortlist.test"}
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "./NotificationBell";

const state = vi.hoisted(() => ({
  data: { enabled: false, configured: true },
  hasData: true,
  supported: true,
  error: undefined as Error | undefined,
  retry: vi.fn(),
  enable: vi.fn(),
  set: vi.fn(),
  onError: vi.fn(),
}));
vi.mock("@/app/lib/data/queries", () => ({
  useNotificationSettings: () => ({
    data: state.hasData ? state.data : undefined,
    error: state.error,
    retry: state.retry,
  }),
}));
vi.mock("@/app/lib/push", () => ({
  supportsPush: () => state.supported,
  enableDeviceNotifications: state.enable,
}));
vi.mock("@/app/lib/api", () => ({
  api: { theatre: () => ({ notifications: { set: state.set } }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.data = { enabled: false, configured: true };
  state.hasData = true;
  state.error = undefined;
  state.supported = true;
  state.enable.mockResolvedValue(undefined);
  state.set.mockResolvedValue({ enabled: true, configured: true });
  state.retry.mockResolvedValue(undefined);
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue({}) },
      }),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const show = () =>
  render(<NotificationBell theatreId="club" onError={state.onError} />);

describe("list notification bell", () => {
  it("enables the device before saving list opt-in", async () => {
    show();
    const bell = screen.getByRole("button", {
      name: "Turn on list notifications",
    });
    expect(bell.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(bell);
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(true));
    expect(state.enable).toHaveBeenCalledOnce();
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it("reports permission errors to the theatre without saving opt-in", async () => {
    state.enable.mockRejectedValue(
      new Error("Allow notifications in site settings."),
    );
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(state.onError).toHaveBeenLastCalledWith(
        "Allow notifications in site settings.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(state.set).not.toHaveBeenCalled();
  });

  it("lets an already-followed list enable another device", async () => {
    state.data.enabled = true;
    navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    });
    const { container } = show();
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable on this device" }),
    );
    await waitFor(() => expect(state.enable).toHaveBeenCalledOnce());
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(true));
    const bell = await screen.findByRole("button", {
      name: "Disable list notifications",
    });
    expect(container.children).toHaveLength(1);
    fireEvent.click(bell);
    await waitFor(() => expect(state.set).toHaveBeenLastCalledWith(false));
    expect(state.enable).toHaveBeenCalledOnce();
  });

  it("disables a list without requesting browser permission", async () => {
    state.data.enabled = true;
    show();
    const bell = await screen.findByRole("button", {
      name: "Disable list notifications",
    });
    expect(bell.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(bell);
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(false));
    expect(state.enable).not.toHaveBeenCalled();
  });

  it.each(["unsupported", "unconfigured"])(
    "explains %s notifications",
    (reason) => {
      if (reason === "unsupported") state.supported = false;
      else state.data.configured = false;
      show();
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(screen.getByRole("button").getAttribute("aria-label")).toContain(
        reason === "unsupported"
          ? "Push notifications need a supported browser and a secure connection."
          : "Notifications are not configured yet.",
      );
      expect(
        screen.queryByText("Notifications are not configured yet."),
      ).toBeNull();
    },
  );

  it("allows opting out even when the current browser is unsupported", async () => {
    state.data.enabled = true;
    state.supported = false;
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(false));
  });

  it("shows save errors without displaying an enabled bell", async () => {
    state.set.mockRejectedValueOnce(new Error("Unable to save notifications."));
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(state.onError).toHaveBeenLastCalledWith(
        "Unable to save notifications.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen
        .getByRole("button", {
          name: "Turn on list notifications",
        })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("disables the bell while saving", async () => {
    let finish!: () => void;
    state.enable.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { container } = show();
    const bell = screen.getByRole("button") as HTMLButtonElement;
    fireEvent.click(bell);
    expect(bell.disabled).toBe(true);
    expect(bell.getAttribute("aria-busy")).toBe("true");
    expect(bell.getAttribute("aria-label")).toBe("Saving notifications...");
    expect(container.children).toHaveLength(1);
    expect(screen.queryByText("Saving notifications...")).toBeNull();
    finish();
    await waitFor(() => expect(bell.disabled).toBe(false));
    expect(bell.getAttribute("aria-busy")).toBe("false");
  });

  it("retries from the bell and clears the shared load error on success", async () => {
    state.hasData = false;
    state.error = new Error("Unable to load notification settings.");
    const { rerender } = show();
    expect(state.onError).toHaveBeenLastCalledWith(state.error.message);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry loading notification settings",
      }),
    );
    expect(state.retry).toHaveBeenCalledOnce();
    expect(state.enable).not.toHaveBeenCalled();
    expect(state.set).not.toHaveBeenCalled();
    state.hasData = true;
    state.error = undefined;
    rerender(<NotificationBell theatreId="club" onError={state.onError} />);
    await waitFor(() => expect(state.onError).toHaveBeenLastCalledWith(""));
    await screen.findByRole("button", { name: "Turn on list notifications" });
  });

  it("reports a retry failure even when its error message hasn't changed", async () => {
    state.hasData = false;
    state.error = new Error("Unable to load notification settings.");
    state.retry.mockRejectedValueOnce(state.error);
    show();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Retry loading notification settings",
      }),
    );
    await screen.findByRole("button", {
      name: "Retry loading notification settings",
    });
    expect(state.onError).toHaveBeenLastCalledWith(state.error.message);
  });

  it("does not offer device setup when this device is already enabled", async () => {
    state.data.enabled = true;
    navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue({}) },
    });
    show();
    await waitFor(() =>
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledOnce(),
    );
    expect(
      screen.queryByRole("button", { name: "Enable on this device" }),
    ).toBeNull();
  });

  it("reports device-check errors to the shared error area", async () => {
    navigator.serviceWorker.getRegistration = vi
      .fn()
      .mockRejectedValue(new Error("Service worker unavailable"));
    show();
    await waitFor(() =>
      expect(state.onError).toHaveBeenLastCalledWith(
        "Unable to check this device's notifications. Reload and try again.",
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
