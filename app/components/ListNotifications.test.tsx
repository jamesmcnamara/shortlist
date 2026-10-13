// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListNotifications } from "./ListNotifications";

const state = vi.hoisted(() => ({
  data: { enabled: false, configured: true },
  supported: true,
  error: undefined as Error | undefined,
  retry: vi.fn(),
  enable: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/app/lib/data/queries", () => ({
  useNotificationSettings: () => ({ data: state.data, error: state.error, retry: state.retry }),
}));
vi.mock("@/app/lib/push", () => ({
  supportsPush: () => state.supported,
  enableDeviceNotifications: state.enable,
}));
vi.mock("@/app/lib/api", () => ({
  api: { room: () => ({ notifications: { set: state.set } }) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.data = { enabled: false, configured: true };
  state.error = undefined;
  state.supported = true;
  state.enable.mockResolvedValue(undefined);
  state.set.mockResolvedValue({ enabled: true, configured: true });
  vi.stubGlobal("Notification", { permission: "granted" });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: vi.fn().mockResolvedValue({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    }) },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("list notification control", () => {
  it("enables the device before saving list opt-in", async () => {
    render(<ListNotifications roomId="club" />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(true));
    expect(state.enable).toHaveBeenCalledOnce();
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it("shows permission errors without saving opt-in", async () => {
    state.enable.mockRejectedValue(new Error("Allow notifications in site settings."));
    render(<ListNotifications roomId="club" />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect((await screen.findByRole("alert")).textContent).toBe("Allow notifications in site settings.");
    expect(state.set).not.toHaveBeenCalled();
  });

  it("lets an already-followed list enable another device", async () => {
    state.data.enabled = true;
    render(<ListNotifications roomId="club" />);
    fireEvent.click(screen.getByRole("button", { name: "Enable on this device" }));
    await waitFor(() => expect(state.enable).toHaveBeenCalledOnce());
  });

  it("disables a list without requesting browser permission", async () => {
    state.data.enabled = true;
    render(<ListNotifications roomId="club" />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(false));
    expect(state.enable).not.toHaveBeenCalled();
  });

  it.each(["unsupported", "unconfigured"])("explains %s notifications", (reason) => {
    if (reason === "unsupported") state.supported = false;
    else state.data.configured = false;
    render(<ListNotifications roomId="club" />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(reason === "unsupported"
      ? "Push notifications need a supported browser and a secure connection."
      : "Notifications are not configured yet.")).toBeTruthy();
  });

  it("allows opting out even when the current browser is unsupported", async () => {
    state.data.enabled = true;
    state.supported = false;
    render(<ListNotifications roomId="club" />);
    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(state.set).toHaveBeenCalledWith(false));
  });
});
