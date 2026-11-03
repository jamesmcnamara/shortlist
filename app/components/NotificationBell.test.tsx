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
  supported: true,
  error: undefined as Error | undefined,
  retry: vi.fn(),
  enable: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/app/lib/data/queries", () => ({
  useNotificationSettings: () => ({
    data: state.data,
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
        pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
      }),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("list notification bell", () => {
  it("enables the device before saving list opt-in", async () => {
    render(<NotificationBell theatreId="club" />);
    const bell = screen.getByRole("button", {
      name: "Notify me when someone adds a movie",
    });
    expect(bell.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(bell);
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(true));
    expect(state.enable).toHaveBeenCalledOnce();
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it("shows permission errors without saving opt-in", async () => {
    state.enable.mockRejectedValue(
      new Error("Allow notifications in site settings."),
    );
    render(<NotificationBell theatreId="club" />);
    fireEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Allow notifications in site settings.",
    );
    expect(state.set).not.toHaveBeenCalled();
  });

  it("lets an already-followed list enable another device", async () => {
    state.data.enabled = true;
    render(<NotificationBell theatreId="club" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable on this device" }),
    );
    await waitFor(() => expect(state.enable).toHaveBeenCalledOnce());
  });

  it("disables a list without requesting browser permission", async () => {
    state.data.enabled = true;
    render(<NotificationBell theatreId="club" />);
    const bell = screen.getByRole("button", {
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
      render(<NotificationBell theatreId="club" />);
      expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(
        screen.getByText(
          reason === "unsupported"
            ? "Push notifications need a supported browser and a secure connection."
            : "Notifications are not configured yet.",
        ),
      ).toBeTruthy();
    },
  );

  it("allows opting out even when the current browser is unsupported", async () => {
    state.data.enabled = true;
    state.supported = false;
    render(<NotificationBell theatreId="club" />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(false));
  });

  it("shows save errors without displaying an enabled bell", async () => {
    state.set.mockRejectedValueOnce(new Error("Unable to save notifications."));
    render(<NotificationBell theatreId="club" />);
    fireEvent.click(screen.getByRole("button"));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Unable to save notifications.",
    );
    expect(
      screen
        .getByRole("button", {
          name: "Notify me when someone adds a movie",
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
    render(<NotificationBell theatreId="club" />);
    const bell = screen.getByRole("button") as HTMLButtonElement;
    fireEvent.click(bell);
    expect(bell.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe(
      "Saving notifications...",
    );
    finish();
    await waitFor(() => expect(bell.disabled).toBe(false));
  });

  it("offers a retry when settings fail to load", () => {
    state.error = new Error("Unable to load notification settings.");
    render(<NotificationBell theatreId="club" />);
    expect(screen.getByRole("alert").textContent).toBe(state.error.message);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it("does not offer device setup when this device is already enabled", async () => {
    state.data.enabled = true;
    navigator.serviceWorker.getRegistration = vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue({}) },
    });
    render(<NotificationBell theatreId="club" />);
    await waitFor(() =>
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalledOnce(),
    );
    expect(
      screen.queryByRole("button", { name: "Enable on this device" }),
    ).toBeNull();
  });
});
