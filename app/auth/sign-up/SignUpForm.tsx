"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { getSafeRedirect } from "@/lib/auth/redirect";
import styles from "../auth.module.css";
import { signUpWithEmail } from "./actions";

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const searchParams = useSearchParams();
  const next = getSafeRedirect(searchParams.get("next"));
  const signInHref =
    next === "/"
      ? "/auth/sign-in"
      : `/auth/sign-in?next=${encodeURIComponent(next)}`;

  return (
    <>
      <form action={formAction} className={styles.form}>
        <input type="hidden" name="next" value={next} />
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
        Already have one? <Link href={signInHref}>Sign in</Link>
      </p>
    </>
  );
}
