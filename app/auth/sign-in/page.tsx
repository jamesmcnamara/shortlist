"use client";

import Link from "next/link";
import { useActionState } from "react";
import styles from "../auth.module.css";
import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>S</span>
          <span>Shortlist</span>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle}>Sign in to see what the group is watching next.</p>

        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input className={styles.input} id="email" name="email" type="email" autoComplete="email" required />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Password</label>
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
            {isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className={styles.footer}>
          New here? <Link href="/auth/sign-up">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
