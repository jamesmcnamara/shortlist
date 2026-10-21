import { withTargetValue } from "@/app/lib/utils";
import styles from "./ListPicker.module.css";

interface NoteFieldProps {
  label?: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}

/** The recommendation posted alongside a film. */
export function NoteField({
  label,
  value,
  disabled,
  onChange,
}: NoteFieldProps) {
  return (
    <textarea
      className={styles.comment}
      rows={3}
      aria-label={label}
      placeholder="Why should they watch it?"
      value={value}
      disabled={disabled}
      onChange={withTargetValue(onChange)}
    />
  );
}
