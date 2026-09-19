import styles from "./AddToLists.module.css";

interface SheetFooterProps {
  count: number;
  isSubmitting: boolean;
}

export function SheetFooter({ count, isSubmitting }: SheetFooterProps) {
  return (
    <div className={styles.footer}>
      <span>{count === 0 ? "No lists selected" : countLabel(count)}</span>
      <button type="submit" disabled={count === 0 || isSubmitting}>
        {isSubmitting ? "Adding..." : addButtonLabel(count)}
      </button>
    </div>
  );
}

const countLabel = (count: number) =>
  `${count} list${count === 1 ? "" : "s"} selected`;

const addButtonLabel = (count: number) =>
  count === 0
    ? "Add to a list"
    : `Add to ${count} list${count === 1 ? "" : "s"}`;
