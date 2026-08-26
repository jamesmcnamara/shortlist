"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { getSafeRedirect } from "@/lib/auth/redirect";
import styles from "../auth.module.css";
import { signInWithEmail } from "./actions";

export function SignInForm() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);
  const searchParams = useSearchParams();
  const next = getSafeRedirect(searchParams.get("next"));

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="email">
          Email
        </label>
        <input
          className={styles.input}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="password">
          Password
        </label>
        <input
          className={styles.input}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state?.error ? <p className={styles.error}>{state.error}</p> : null}

      <button className={styles.submit} type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Come and play with us..."}
      </button>
    </form>
  );
}
