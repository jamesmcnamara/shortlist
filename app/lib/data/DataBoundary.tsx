"use client";

import Link from "next/link";
import { redirect, usePathname } from "next/navigation";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { isAccessError, useDataSession } from "./DataProvider";
import styles from "./DataBoundary.module.css";

interface DataBoundaryProps {
  pending: boolean;
  error?: Error;
  retry: () => unknown;
  children: React.ReactNode;
}

export function DataBoundary({
  pending,
  error,
  retry,
  children,
}: DataBoundaryProps) {
  const session = useDataSession();
  const pathname = usePathname();
  if (
    (!session.userId && !session.isPending && !session.error) ||
    (isAccessError(error) && error.status === 401)
  ) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
  }

  if (isAccessError(error)) {
    return (
      <main className={styles.message} role="alert">
        <p>{error.message}</p>
        <Link href="/rooms">Back to your rooms</Link>
      </main>
    );
  }

  const message = error?.message ?? session.error?.message;
  return (
    <>
      {message && (
        <div className={styles.message} role="alert">
          <p>
            {message}
            {!pending && " Showing the last loaded content."}
          </p>
          <button
            type="button"
            onClick={() => (session.error ? session.retry() : retry())}
          >
            Try again
          </button>
        </div>
      )}
      {pending || !session.userId
        ? !message && <LoadingOverlay />
        : children}
    </>
  );
}
