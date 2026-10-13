// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { disconnectDeviceNotifications, enableDeviceNotifications } from "./push";
import { api } from "./api";

vi.mock("./api", () => ({
  api: { push: { subscribe: vi.fn(), disconnect: vi.fn() } },
}));
const permission = vi.fn();
const subscribe = vi.fn();
const unsubscribe = vi.fn();
const getSubscription = vi.fn();
const getRegistration = vi.fn();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", toJSON: () => ({ endpoint: "test" }), unsubscribe };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "AQID");
  vi.stubGlobal("Notification", { requestPermission: permission });
  vi.stubGlobal("PushManager", {});
  vi.stubGlobal("isSecureContext", true);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true, value: { getRegistration },
  });
  permission.mockResolvedValue("granted");
  unsubscribe.mockResolvedValue(true);
  getSubscription.mockResolvedValue(null);
  subscribe.mockResolvedValue(subscription);
  getRegistration.mockResolvedValue({ active: {}, pushManager: { getSubscription, subscribe } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("device push lifecycle", () => {
  it("requests permission immediately and saves a user-visible subscription", async () => {
    const enabling = enableDeviceNotifications();
    expect(permission).toHaveBeenCalledOnce();
    await enabling;
    expect(subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true, applicationServerKey: Uint8Array.from([1, 2, 3]),
    });
    expect(api.push.subscribe).toHaveBeenCalledWith(subscription.toJSON());
  });

  it("reuses and registers an existing browser subscription", async () => {
    getSubscription.mockResolvedValue(subscription);
    await enableDeviceNotifications();
    expect(subscribe).not.toHaveBeenCalled();
    expect(api.push.subscribe).toHaveBeenCalledOnce();
  });

  it.each(["denied", "default"])("does not subscribe when permission is %s", async (result) => {
    permission.mockResolvedValue(result);
    await expect(enableDeviceNotifications()).rejects.toThrow("Notifications are blocked.");
    expect(subscribe).not.toHaveBeenCalled();
    expect(api.push.subscribe).not.toHaveBeenCalled();
  });

  it("reports a missing active worker instead of waiting indefinitely", async () => {
    getRegistration.mockResolvedValue(undefined);
    await expect(enableDeviceNotifications()).rejects.toThrow("Reload the page");
  });

  it("removes the authenticated server subscription before unsubscribing locally", async () => {
    getSubscription.mockResolvedValue(subscription);
    await disconnectDeviceNotifications();
    expect(api.push.disconnect).toHaveBeenCalledWith(subscription.endpoint);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.mocked(api.push.disconnect).mock.invocationCallOrder[0])
      .toBeLessThan(unsubscribe.mock.invocationCallOrder[0]);
  });

  it("surfaces disconnect failures without orphaning a server subscription", async () => {
    getSubscription.mockResolvedValue(subscription);
    vi.mocked(api.push.disconnect).mockRejectedValue(new Error("Network unavailable"));
    await expect(disconnectDeviceNotifications()).rejects.toThrow("Network unavailable");
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("does not call the server when this device has no subscription", async () => {
    await disconnectDeviceNotifications();
    expect(api.push.disconnect).not.toHaveBeenCalled();
  });
});
