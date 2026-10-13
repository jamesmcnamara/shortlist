import { api } from "./api";

export const supportsPush = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export async function enableDeviceNotifications() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Notifications are not configured yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      "Notifications are blocked. Allow them in your browser's site settings, then try again.",
    );
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active)
    throw new Error(
      "Notifications are not ready. Reload the page and try again.",
    );
  const decoded = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
  const applicationServerKey = Uint8Array.from(decoded, (character) =>
    character.charCodeAt(0),
  );
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));
  await api.push.subscribe(subscription.toJSON());
}

export async function disconnectDeviceNotifications() {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.push.disconnect(subscription.endpoint);
  if (!(await subscription.unsubscribe()))
    throw new Error("Unable to disconnect browser notifications.");
}
