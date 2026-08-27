import { useState, type SubmitEventHandler } from "react";
import styles from "./MovieDiscussion.module.css";

interface EditableCommentProps {
  value: string;
  canEdit: boolean;
  allowBlank: boolean;
  emptyText: string;
  editLabel: string;
  inputLabel: string;
  onSave: (comment: string) => Promise<boolean>;
}

export function EditableComment({
  value,
  canEdit,
  allowBlank,
  emptyText,
  editLabel,
  inputLabel,
  onSave,
}: EditableCommentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const beginEdit = () => {
    setDraft(value);
    setIsEditing(true);
  };

  const submit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const next = draft.trim();
    if ((!allowBlank && !next) || isSaving) return;

    setIsSaving(true);
    try {
      if (await onSave(next)) setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <form className={styles.editCommentForm} onSubmit={submit}>
        <textarea
          aria-label={inputLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          autoFocus
        />
        <span className={styles.editActions}>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={(!allowBlank && !draft.trim()) || isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </span>
      </form>
    );
  }

  return (
    <span className={styles.commentBody}>
      <span className={value ? styles.commentText : styles.emptyComment}>
        {value || emptyText}
      </span>
      {canEdit && (
        <button
          className={styles.editComment}
          type="button"
          onClick={beginEdit}
          aria-label={editLabel}
          title="Edit comment"
        >
          ✎
        </button>
      )}
    </span>
  );
}
