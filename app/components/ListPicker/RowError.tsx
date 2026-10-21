import styles from "./ListPicker.module.css";

export function RowError({ message }: { message: string }) {
  return (
    <p className={styles.rowError} role="alert">
      {message}
    </p>
  );
}
