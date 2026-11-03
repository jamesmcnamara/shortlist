"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { useNotificationSettings } from "@/app/lib/data/queries";
import { enableDeviceNotifications, supportsPush } from "@/app/lib/push";
import styles from "./NotificationBell.module.css";

interface NotificationBellProps {
  theatreId: string;
}

export function NotificationBell({ theatreId }: NotificationBellProps) {
  const { data, error: loadError, retry } = useNotificationSettings(theatreId);
  const [supported, setSupported] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const supported = supportsPush();
    setSupported(supported);
    if (supported) {
      navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.pushManager.getSubscription())
        .then((subscription) => {
          if (active)
            setDeviceEnabled(
              Boolean(subscription) && Notification.permission === "granted",
            );
        })
        .catch(() => {
          if (active)
            setError(
              "Unable to check this device's notifications. Reload and try again.",
            );
        });
    }
    return () => {
      active = false;
    };
  }, []);

  async function change(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        await enableDeviceNotifications();
        setDeviceEnabled(true);
      }
      await api.theatre(theatreId).notifications.set(enabled);
      await retry();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update notifications. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const label = data?.enabled
    ? "Disable list notifications"
    : "Notify me when someone adds a movie";
  const unavailable = !supported
    ? "Push notifications need a supported browser and a secure connection."
    : data && !data.configured
      ? "Notifications are not configured yet."
      : "";
  const isLocalhost = window.location.hostname === "localhost";
  const needsDevice =
    data?.enabled && supported && data.configured && deviceEnabled === false;

  return (
    <>
      <button
        className={styles.bell}
        type="button"
        aria-label={label}
        aria-pressed={data?.enabled ?? false}
        aria-busy={busy}
        title={`${label}. ${unavailable || "Applies to this list on your enabled devices. Your own additions are excluded."}`}
        disabled={
          busy || !data || (!data.enabled && (!supported || !data.configured))
        }
        onClick={() => change(!data?.enabled)}
      >
        <svg
          viewBox="0 0 24 24"
          fill={data?.enabled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      </button>
      {(unavailable || needsDevice || busy || error || loadError) && (
        <div className={styles.feedback}>
          {unavailable && <p>{unavailable}</p>}
          {needsDevice && !isLocalhost && (
            <button type="button" disabled={busy} onClick={() => change(true)}>
              Enable on this device
            </button>
          )}
          {busy && <p role="status">Saving notifications...</p>}
          {(error || loadError) && (
            <p className={styles.error} role="alert">
              {error || loadError?.message}
            </p>
          )}
          {loadError && (
            <button type="button" onClick={() => retry()}>
              Retry
            </button>
          )}
        </div>
      )}
    </>
  );
}
