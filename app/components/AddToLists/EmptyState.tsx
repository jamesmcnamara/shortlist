import styles from "./AddToLists.module.css";

export function EmptyState() {
  return (
    <div className={styles.empty}>
      <p>You&apos;re not in any shared watch lists yet.</p>
    </div>
  );
}
