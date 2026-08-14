"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import { api } from "@/app/lib/api";
import styles from "@/app/auth/auth.module.css";

export default function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .join(code)
      .then(({ slug }) => router.replace(`/r/${slug}`))
      .catch((error: Error) => setError(error.message));
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
