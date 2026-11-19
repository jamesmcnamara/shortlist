"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSafeRedirect } from "@/lib/auth/redirect";
import { useAuthAction } from "@/lib/auth/use-auth-action";
import styles from "@/app/components/FormPage.module.css";
import { signUpWithHandle } from "./actions";

// Matches "alice", "@alice", and "alice-2".
const HANDLE_INPUT_PATTERN = "@?[A-Za-z0-9][A-Za-z0-9\\-]{1,28}[A-Za-z0-9]";

export function SignUpForm() {
  const [state, formAction, isPending] = useAuthAction(signUpWithHandle);
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
          <label className={styles.label} htmlFor="username">
            Handle
          </label>
          <span className={styles.hint} id="username-hint">
            Your public @handle. Come on, have some fun. I bet @hot-dog isn't
            taken yet.
          </span>
          <input
            className={styles.input}
            id="username"
            name="username"
            aria-describedby="username-hint"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            minLength={3}
            maxLength={31}
            pattern={HANDLE_INPUT_PATTERN}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <span className={styles.hint} id="password-hint">
            None of that "minimum 12 characters plus a special" here. Go for a
            classic. "password" or "1234". Who's gonna hack this shit? There's
            no password reset, so keep it somewhere safe.
          </span>
          <input
            className={styles.input}
            id="password"
            name="password"
            aria-describedby="password-hint"
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
