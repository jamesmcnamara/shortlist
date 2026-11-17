"use client";

import { useId, useState } from "react";
import { api } from "@/app/lib/api";
import { useNotificationSettings } from "@/app/lib/data/queries";
import { extensionNotifications } from "@/app/lib/extensions/view";
import type { NotificationChanges } from "@/lib/notifications/settings";
import { useTheatre } from "../TheatreContext";
import styles from "./page.module.css";

interface ChoiceProps {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

function Choice({
  label,
  description,
  checked,
  disabled,
  onChange,
}: ChoiceProps) {
  const id = useId();
  return (
    <div className={styles.choice}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={`${id}-description`}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      <span id={`${id}-description`} className={styles.hint}>
        {description}
      </span>
    </div>
  );
}

/** Lets a member choose which of the list's notifications they get. */
export function ListNotifications() {
  const { theatre } = useTheatre();
  const { data, error: loadError, retry } = useNotificationSettings(theatre.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function choose(changes: NotificationChanges) {
    setSaving(true);
    setError("");
    try {
      await api.theatre(theatre.id).notifications.choose(changes);
      await retry();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const choices = [
    {
      key: "newMovies",
      label: "New movies",
      description: "When someone else adds a movie.",
      checked: data?.newMovies ?? true,
      change: (on: boolean) => ({ newMovies: on }),
    },
    ...Object.entries(extensionNotifications(theatre.description)).flatMap(
      ([name, categories]) =>
        categories.map(({ id, label, description }) => ({
          key: `${name}.${id}`,
          label,
          description,
          // Settings cached before categories existed have no `extensions`.
          checked: data?.extensions?.[name]?.[id] ?? true,
          change: (on: boolean) => ({ extensions: { [name]: { [id]: on } } }),
        })),
    ),
  ];

  const status = loadError
    ? ""
    : !data
      ? "Loading…"
      : !data.configured
        ? "Notifications are not configured yet."
        : !data.enabled
          ? "Turn on notifications with the bell on the list first, then choose which ones you get here."
          : "";

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Notifications</h2>
      {status && <p className={styles.hint}>{status}</p>}
      {loadError && (
        <div className={styles.inlineRow} role="alert">
          <span className={styles.hint}>
            Unable to load your notification settings.
          </span>
          <button
            className={styles.ghostButton}
            type="button"
            onClick={() => retry()}
          >
            Try again
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {choices.map(({ key, change, ...choice }) => (
        <Choice
          key={key}
          {...choice}
          disabled={!data?.enabled || saving}
          onChange={(on) => choose(change(on))}
        />
      ))}
    </section>
  );
}
