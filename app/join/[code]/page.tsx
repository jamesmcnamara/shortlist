"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { ApiError, api } from "@/app/lib/api";
import styles from "@/app/auth/auth.module.css";

interface JoinPageProps {
  params: Promise<{ code: string }>;
}

export default function JoinPage({ params }: JoinPageProps) {
  const { code } = use(params);
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .join(code)
      .then(({ slug }) => router.replace(`/r/${slug}`))
      .catch((error: Error) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace(
            `/auth/sign-up?next=${encodeURIComponent(`/join/${code}`)}`,
          );
          return;
        }

        setError(error.message);
      });
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
