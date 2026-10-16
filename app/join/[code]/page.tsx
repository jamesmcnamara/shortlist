"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { api } from "@/app/lib/api";
import { useDataSession } from "@/app/lib/data/DataProvider";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { PublicTheatreContainer } from "./PublicTheatreContainer";
import styles from "@/app/components/FormPage.module.css";

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

export default function JoinPage({ params }: JoinPageProps) {
  const { code } = use(params);
  const session = useDataSession();

  if (session.isPending) return <LoadingOverlay />;
  if (session.error) {
    return (
      <main className={styles.shell}>
        <div className={styles.card} role="alert">
          <h1 className={styles.title}>Unable to check your session</h1>
          <p className={styles.subtitle}>
            {session.error.message || "Please try again."}
          </p>
          <button
            className={styles.submit}
            type="button"
            onClick={() => session.retry()}
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return session.userId ? (
    <JoinTheatre key={code} code={code} />
  ) : (
    <Suspense fallback={<LoadingOverlay />}>
      <PublicTheatreContainer inviteCode={code} />
    </Suspense>
  );
}

function JoinTheatre({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .join(code)
      .then(({ path }) => {
        if (active) router.replace(path);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [code, router]);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span>Shortlist</span>
        </div>
        <h1 className={styles.title}>
          {error ? "That link did not work" : "Joining…"}
        </h1>
        <p className={styles.subtitle}>
          {error || "Hang tight while we get you in."}
        </p>
      </div>
    </main>
  );
}
