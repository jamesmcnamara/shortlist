"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/lib/api";
import {
  PRESET_DESCRIPTIONS,
  PRESET_LABELS,
  slugify,
  type PresetName,
} from "@/app/lib/rooms";
import { withTargetValue } from "@/app/lib/utils";
import styles from "@/app/auth/auth.module.css";
import newRoomStyles from "./page.module.css";

const PRESETS: PresetName[] = ["club", "watchlist"];

export default function NewRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<PresetName>("club");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slug = slugify(name);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      const room = await api.rooms.create({ name: name.trim(), preset });
      router.push(`/r/${room.slug}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to create the room.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span>Shortlist</span>
        </div>

        <h1 className={styles.title}>Start something</h1>
        <p className={styles.subtitle}>You can change any of this later.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Name
            </label>
            <input
              className={styles.input}
              id="name"
              value={name}
              onChange={withTargetValue(setName)}
              placeholder="Friday Night Club"
              required
            />
            {slug && (
              <span className={styles.hint}>shortlist.app/r/{slug}</span>
            )}
          </div>

          <fieldset className={newRoomStyles.presets}>
            <legend className={styles.label}>How it works</legend>
            {PRESETS.map((option) => (
              <label
                key={option}
                className={`${newRoomStyles.preset} ${
                  preset === option ? newRoomStyles.presetActive : ""
                }`}
              >
                <input
                  type="radio"
                  name="preset"
                  value={option}
                  checked={preset === option}
                  onChange={() => setPreset(option)}
                  className={newRoomStyles.presetInput}
                />
                <span className={newRoomStyles.presetName}>
                  {PRESET_LABELS[option]}
                </span>
                <span className={newRoomStyles.presetDescription}>
                  {PRESET_DESCRIPTIONS[option]}
                </span>
              </label>
            ))}
          </fieldset>

          {error && <p className={styles.error}>{error}</p>}

          <button
            className={styles.submit}
            type="submit"
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? "Creating…" : "Create"}
          </button>
        </form>
      </div>
    </main>
  );
}
