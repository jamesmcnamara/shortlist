"use client";

import Link from "next/link";
import { redirect, usePathname } from "next/navigation";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { isAccessError, useDataSession } from "./DataProvider";
import styles from "./DataBoundary.module.css";
import { userPath } from "@/lib/user-path";

interface DataBoundaryProps {
  pending: boolean;
  error?: Error;
  retry: () => unknown;
  requiresUser?: boolean;
  children: React.ReactNode;
}

export function DataBoundary({
  pending,
  error,
  retry,
  requiresUser = true,
  children,
}: DataBoundaryProps) {
  const session = useDataSession();
  const pathname = usePathname();
  if (
    requiresUser &&
    ((!session.userId && !session.isPending && !session.error) ||
      (isAccessError(error) && error.status === 401))
  ) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(pathname)}`);
  }

  if (isAccessError(error)) {
    return (
      <main className={styles.message} role="alert">
        <p>{error.message}</p>
        {session.userId && (
          <Link href={userPath(session.userId)}>Back to My Theatres</Link>
        )}
      </main>
    );
  }

  // A signed-out viewer of public content doesn't care about session errors.
  const sessionError = requiresUser ? session.error : null;
  const message = error?.message ?? sessionError?.message;
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
            onClick={() => (sessionError ? session.retry() : retry())}
          >
            Try again
          </button>
        </div>
      )}
      {pending || (requiresUser && !session.userId)
        ? !message && <LoadingOverlay />
        : children}
    </>
  );
}
