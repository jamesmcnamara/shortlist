import styles from "./Oscars.module.css";

export const OscarStatuette = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 32"
    role="img"
    aria-label="Oscar"
  >
    <circle cx="12" cy="4.5" r="3" />
    <path d="M8.7 8.4h6.6l1.4 8.1-2.5 7.1H9.8l-2.5-7.1 1.4-8.1Z" />
    <path d="M9.7 23.2h4.6l1 3.1H8.7l1-3.1Z" />
    <path d="M6.5 27h11l1.5 3H5l1.5-3Z" />
  </svg>
);
