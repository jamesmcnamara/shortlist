import { FilmReelIcon } from "./FilmReelIcon";
import styles from "./LoadingOverlay.module.css";
import classnames from "classnames";

interface LoadingOverlayProps {
  label?: string;
  fullscreen?: boolean;
  inline?: boolean;
}

export function LoadingOverlay({
  label = "Loading...",
  fullscreen = true,
  inline = false,
}: LoadingOverlayProps) {
  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={classnames({
        [styles.overlay]: fullscreen && !inline,
        [styles.contained]: !fullscreen && !inline,
        [styles.inline]: inline,
      })}
      role="status"
    >
      <FilmReelIcon
        className={classnames(styles.reel, {
          [styles.centeredRotation]: !inline && !fullscreen,
        })}
        size={inline ? 20 : 56}
        circular={inline}
      />
    </div>
  );
}
