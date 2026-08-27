"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/app/lib/api";
import { withTargetValue } from "@/app/lib/utils";
import type { FeedbackCategory } from "@/src/db/schema";
import authStyles from "@/app/auth/auth.module.css";
import styles from "./page.module.css";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Something's broken",
  feature: "A new feature idea",
  design: "The design could be better",
  copy: "You missed an opportunity for a movie pun",
  other: "Something else",
};

export default function FeedbackPage() {
  const router = useRouter();
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Let us know what's on your mind.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await api.feedback.create({
        message: trimmed,
        ...(category ? { category } : {}),
      });
      setIsSubmitted(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to submit feedback right now.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={authStyles.shell}>
      <div className={authStyles.card}>
        <div className={authStyles.brand}>
          <span>Shortlist</span>
        </div>

        <h1 className={authStyles.title}>Send feedback</h1>
        <p className={authStyles.subtitle}>
          Bugs, feature ideas, design gripes, or copy that reads wrong — all of
          it is welcome. Tell me whatever's on your mind. But be so gentle, I am
          fragile and require constant praise.
        </p>

        {isSubmitted ? (
          <>
            <p className={styles.success}>
              Thanks! Your feedback has been sent.
            </p>
            <button
              className={authStyles.submit}
              type="button"
              onClick={() => router.back()}
            >
              Back
            </button>
          </>
        ) : (
          <form className={authStyles.form} onSubmit={handleSubmit}>
            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="category">
                What kind of feedback is this? (optional)
              </label>
              <select
                className={authStyles.input}
                id="category"
                value={category}
                onChange={withTargetValue((value) =>
                  setCategory(value as FeedbackCategory | ""),
                )}
              >
                <option value="">Not sure / doesn't fit</option>
                {(Object.keys(CATEGORY_LABELS) as FeedbackCategory[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {CATEGORY_LABELS[key]}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className={authStyles.field}>
              <label className={authStyles.label} htmlFor="message">
                Your feedback
              </label>
              <textarea
                className={authStyles.input}
                id="message"
                rows={6}
                value={message}
                onChange={withTargetValue(setMessage)}
                placeholder="What would you like us to know?"
              />
            </div>

            {error && <p className={authStyles.error}>{error}</p>}

            <button
              className={authStyles.submit}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
