import styles from "./page.module.css";

interface ClockProps {
  label: string;
}

export const ClockIcon = ({ label }: ClockProps) => (
  <svg
    className={styles.clock}
    viewBox="0 0 24 24"
    role="img"
    aria-label={label}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
