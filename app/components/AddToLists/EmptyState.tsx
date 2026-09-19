import styles from "./AddToLists.module.css";

interface EmptyStateProps {
  hasOtherRooms: boolean;
}

export function EmptyState({ hasOtherRooms }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <p>You&apos;re not in any shared watch lists yet.</p>
      {hasOtherRooms && (
        <p className={styles.emptyHint}>
          Movie club rooms use nominations instead.
        </p>
      )}
    </div>
  );
}
