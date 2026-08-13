"use client";

import Link from "next/link";
import { useActionState } from "react";
import styles from "../auth.module.css";
import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span>Shortlist</span>
        </div>

        <h1 className={styles.title}>Join the shortlist</h1>

        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Name
            </label>
            <span className={styles.hint}>
              Or a character name. Or anything else you like. I'm not a cop.
            </span>
            <input
              className={styles.input}
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <span className={styles.hint}>This one I do actually need</span>
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
            <span className={styles.hint}>
              None of that "minimum 12 characters plus a special" here. Go for a
              classic. "password" or "1234". Who's gonna hack this shit?
            </span>
            <input
              className={styles.input}
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>

          {state?.error ? <p className={styles.error}>{state.error}</p> : null}

          <button className={styles.submit} type="submit" disabled={isPending}>
            {isPending
              ? "The loser is getting in…"
              : "Get in loser, we're going nominating"}
          </button>
        </form>

        <p className={styles.footer}>
          Already have one? <Link href="/auth/sign-in">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
