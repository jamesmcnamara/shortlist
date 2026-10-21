import classnames from "classnames";
import styles from "./ListPicker.module.css";

interface ListOptionProps {
  name: string;
  checked: boolean;
  /** Shown checked and can't be changed, e.g. the film is already there. */
  locked: boolean;
  disabled: boolean;
  isPending: boolean;
  hint: string;
  onToggle: () => void;
}

/** One list's checkbox row in a `ListPickerSheet`. */
export function ListOption({
  name,
  checked,
  locked,
  disabled,
  isPending,
  hint,
  onToggle,
}: ListOptionProps) {
  return (
    <label
      className={classnames(styles.theatreLabel, {
        [styles.theatreLabelLocked]: locked,
      })}
    >
      <input
        type="checkbox"
        checked={locked || checked}
        disabled={locked || disabled}
        onChange={onToggle}
      />
      <span className={styles.theatreName}>{name}</span>
      {isPending ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        hint && <span className={styles.theatreHint}>{hint}</span>
      )}
    </label>
  );
}
