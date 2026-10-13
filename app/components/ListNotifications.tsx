"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/lib/api";
import { useNotificationSettings } from "@/app/lib/data/queries";
import { enableDeviceNotifications, supportsPush } from "@/app/lib/push";
import styles from "./ListNotifications.module.css";

export function ListNotifications({ roomId }: { roomId: string }) {
  const { data, error: loadError, retry } = useNotificationSettings(roomId);
  const [supported, setSupported] = useState(false);
  const [deviceEnabled, setDeviceEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const supported = supportsPush();
    setSupported(supported);
    if (supported) {
      navigator.serviceWorker.getRegistration()
        .then((registration) => registration?.pushManager.getSubscription())
        .then((subscription) => {
          if (active) setDeviceEnabled(Boolean(subscription) && Notification.permission === "granted");
        })
        .catch(() => {
          if (active) setError("Unable to check this device's notifications. Reload and try again.");
        });
    }
    return () => { active = false; };
  }, []);

  async function change(enabled: boolean) {
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        await enableDeviceNotifications();
        setDeviceEnabled(true);
      }
      await api.room(roomId).notifications.set(enabled);
      await retry();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-label="List notifications">
      <label className={styles.toggle}>
        <input type="checkbox" checked={data?.enabled ?? false}
          disabled={busy || !data || (!data.enabled && (!supported || !data.configured))}
          onChange={(event) => change(event.target.checked)} />
        Notify me when someone adds a movie
      </label>
      <p className={styles.hint}>
        {!supported ? "Push notifications need a supported browser and a secure connection."
          : data && !data.configured ? "Notifications are not configured yet."
          : "Applies to this list on your enabled devices. Your own additions are excluded."}
      </p>
      {data?.enabled && supported && data.configured && !deviceEnabled && (
        <button className={styles.button} type="button" disabled={busy} onClick={() => change(true)}>
          Enable on this device
        </button>
      )}
      {busy && <p className={styles.hint} role="status">Saving notifications...</p>}
      {(error || loadError) && <p className={styles.error} role="alert">{error || loadError?.message}</p>}
      {loadError && <button className={styles.button} type="button" onClick={() => retry()}>Retry</button>}
    </section>
  );
}
