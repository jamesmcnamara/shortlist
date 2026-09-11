import { FilmReelIcon } from "./FilmReelIcon";
import styles from "./LoadingOverlay.module.css";
import classnames from "classnames";

interface LoadingOverlayProps {
  label?: string;
  fullscreen?: boolean;
}

export function LoadingOverlay({
  label = "Loading...",
  fullscreen = true,
}: LoadingOverlayProps) {
  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={classnames({
        [styles.overlay]: fullscreen,
        [styles.inline]: !fullscreen,
      })}
      role="status"
    >
      <FilmReelIcon className={styles.reel} size={56} />
    </div>
  );
}
