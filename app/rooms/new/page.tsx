"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/lib/api";
import { slugify } from "@/app/lib/rooms";
import { withTargetValue } from "@/app/lib/utils";
import styles from "@/app/auth/auth.module.css";

export default function NewRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slug = slugify(name);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      const room = await api.rooms.create({ name: name.trim() });
      router.push(room.path);
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
              placeholder="Friday Night Movies"
              required
            />
            {slug && (
              <span className={styles.hint}>shortlist.app/…/{slug}</span>
            )}
          </div>

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
