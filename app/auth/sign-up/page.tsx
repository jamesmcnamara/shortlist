import { Suspense } from "react";
import styles from "../auth.module.css";
import { SignUpForm } from "./SignUpForm";

export default function SignUpPage() {
  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span>Shortlist</span>
        </div>

        <h1 className={styles.title}>Join the shortlist</h1>

        <Suspense fallback={<div className={styles.form} />}>
          <SignUpForm />
        </Suspense>
      </div>
    </main>
  );
}
