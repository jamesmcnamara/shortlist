"use client";

import { api } from "@/app/lib/api";
import { useNotificationSettings } from "@/app/lib/data/queries";
import { enableDeviceNotifications, supportsPush } from "@/app/lib/push";
import classnames from "classnames";
import { useEffect, useState } from "react";
import styles from "./NotificationBell.module.css";

interface NotificationBellProps {
  theatreId: string;
  onError: (message: string) => void;
}

export function NotificationBell({
  theatreId,
  onError,
}: NotificationBellProps) {
  const { data, error: loadError, retry } = useNotificationSettings(theatreId);
  const [supported, setSupported] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState<boolean | null>(null);
  const [checkingDevice, setCheckingDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const message = error || loadError?.message || "";

  useEffect(() => {
    onError(message);
  }, [message, onError]);

  useEffect(() => {
    let active = true;
    const supported = supportsPush();
    setSupported(supported);
    if (supported) {
      setCheckingDevice(true);
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
        })
        .finally(() => {
          if (active) setCheckingDevice(false);
        });
    }
    return () => {
      active = false;
    };
  }, []);

  async function change() {
    setBusy(true);
    setError("");
    onError("");
    try {
      if (loadError) {
        await retry();
        return;
      }
      const enabled = needsDevice || !data?.enabled;
      if (enabled) {
        await enableDeviceNotifications();
        setDeviceEnabled(true);
      }
      await api.theatre(theatreId).notifications.set(enabled);
      await retry();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to update notifications. Try again.";
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  }

  const unavailable = !supported
    ? "Push notifications need a supported browser and a secure connection."
    : data && !data.configured
      ? "Notifications are not configured yet."
      : "";
  const needsDevice =
    data?.enabled &&
    supported &&
    data.configured &&
    deviceEnabled === false &&
    window.location.hostname !== "localhost";
  const pending =
    busy || (!data && !loadError) || (data?.enabled && checkingDevice);
  const label = pending
    ? busy
      ? "Saving notifications..."
      : "Checking notifications..."
    : loadError
      ? "Retry loading notification settings"
      : needsDevice
        ? "Enable on this device"
        : data?.enabled
          ? "Disable list notifications"
          : "Turn on list notifications";

  return (
    <button
      className={classnames(styles.bell, {
        [styles.attention]: needsDevice,
        [styles.error]: Boolean(message),
      })}
      type="button"
      aria-label={
        unavailable && !pending && !loadError
          ? `${label}. ${unavailable}`
          : label
      }
      aria-pressed={data?.enabled ?? false}
      aria-busy={Boolean(pending)}
      title={`${label}. ${unavailable || "Applies to this list on your enabled devices. Choose which ones you get in Settings."}`}
      disabled={
        Boolean(pending) ||
        (!loadError && !data?.enabled && Boolean(unavailable))
      }
      onClick={change}
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
  );
}
