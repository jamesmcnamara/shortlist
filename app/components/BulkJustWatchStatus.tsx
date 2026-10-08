import type { JustWatchAPI } from "@/app/lib/useBulkJustWatch";
import styles from "./BulkJustWatchStatus.module.css";

export function BulkJustWatchStatus({ bulk }: { bulk: JustWatchAPI }) {
  if (bulk.rows.length === 0) return null;
  const pending = bulk.rows.some((row) => row.status === "pending");
  const failed = bulk.rows.filter((row) => row.status === "failed");
  const unmatched = bulk.rows.filter((row) => row.status === "not_found");
  const updated = bulk.rows.filter((row) => row.status === "updated").length;
  const processed = bulk.rows.filter((row) => row.status !== "pending").length;

  return (
    <section className={styles.status} aria-label="Bulk JustWatch progress">
      <p role="status">
        {bulk.isRunning
          ? bulk.isStopping
            ? "Stopping after this movie."
            : "Updating JustWatch."
          : pending
            ? "JustWatch update stopped."
            : "JustWatch update complete."}{" "}
        {processed} of {bulk.rows.length} processed. {updated} updated.
      </p>
      {failed.length > 0 && (
        <ul className={styles.errors} aria-label="JustWatch failures">
          {failed.map((row) => (
            <li key={row.id}>
              {row.title}: {row.error}
            </li>
          ))}
        </ul>
      )}
      {unmatched.length > 0 && (
        <p>
          No JustWatch match: {unmatched.map((row) => row.title).join(", ")}.
        </p>
      )}
      <div className={styles.actions}>
        {bulk.isRunning && (
          <button type="button" disabled={bulk.isStopping} onClick={bulk.stop}>
            {bulk.isStopping ? "Stopping..." : "Stop JustWatch update"}
          </button>
        )}
        {!bulk.isRunning && pending && (
          <button type="button" onClick={() => void bulk.resume()}>
            Continue JustWatch update
          </button>
        )}
        {!bulk.isRunning && failed.length > 0 && (
          <button type="button" onClick={() => void bulk.retry()}>
            Retry failed movies
          </button>
        )}
      </div>
    </section>
  );
}
