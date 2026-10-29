import { SlideOpen } from "@/app/components/SlideOpen";
import type { TheatreSummary } from "@/app/lib/api";
import { ListOption } from "../ListPicker/ListOption";
import { NoteField } from "../ListPicker/NoteField";
import { RowError } from "../ListPicker/RowError";
import type { RowStatus } from "../ListPicker/types";
import styles from "./AddToLists.module.css";

interface TheatreRowProps {
  theatre: TheatreSummary;
  hasMovie: boolean;
  checked: boolean;
  comment: string;
  status: RowStatus;
  error: string;
  onToggle: () => void;
  onCommentChange: (value: string) => void;
}

/** One watch list, with the note that will be posted alongside the movie. */
export function TheatreRow({
  theatre,
  hasMovie,
  checked,
  comment,
  status,
  error,
  onToggle,
  onCommentChange,
}: TheatreRowProps) {
  const justAdded = status === "done";
  const isPending = status === "pending";
  const locked = hasMovie || justAdded;
  return (
    <div className={styles.row}>
      <ListOption
        name={theatre.name}
        checked={checked}
        locked={locked}
        disabled={isPending}
        isPending={isPending}
        hint={hasMovie ? "Already on this list" : justAdded ? "Added ✓" : ""}
        onToggle={onToggle}
      />
      <SlideOpen open={checked && !locked} className={styles.commentWrap}>
        <NoteField
          value={comment}
          disabled={isPending}
          onChange={onCommentChange}
        />
      </SlideOpen>
      {status === "error" && error && <RowError message={error} />}
    </div>
  );
}
