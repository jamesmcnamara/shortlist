import styles from "./ShortlistHeader.module.css";

export function ShortlistHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <span className={styles.mark}>S</span>
        <span>Shortlist</span>
      </div>
      <div className={styles.profile}>
        <span className="avatar avatar-violet">JM</span>
        <span>James</span>
        <span className={styles.chevron}>⌄</span>
      </div>
    </header>
  );
}
