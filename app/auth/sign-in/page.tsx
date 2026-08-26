import Link from "next/link";
import { Suspense } from "react";
import styles from "../auth.module.css";
import { SignInForm } from "./SignInForm";

export default function SignInPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span>Shortlist</span>
        </div>

        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.subtitle} />

        <Suspense fallback={<div className={styles.form} />}>
          <SignInForm />
        </Suspense>

        <p className={styles.footer}>
          New here? <Link href="/auth/sign-up">Join the club</Link>
        </p>
      </div>
    </main>
  );
}
