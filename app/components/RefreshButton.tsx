import styles from "./RefreshButton.module.css";

export function RefreshButton({
  onClick,
  busy,
  label,
  title,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
  title: string;
}) {
  return (
    <button
      className={styles.refresh}
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      aria-busy={busy}
      title={title}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M20 11a8 8 0 1 0-2.3 6.7" />
        <path d="M20 4v7h-7" />
      </svg>
    </button>
  );
}
