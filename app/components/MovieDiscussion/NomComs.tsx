import type { NomCom } from "@/src/db/schema";
import { useState, type SubmitEventHandler } from "react";
import styles from "./MovieDiscussion.module.css";
import { getColor, getInitials } from "@/app/lib/utils";
import { EditableComment } from "./EditableComment";

interface NomComsProps {
  nominationId: number;
  nomcoms: NomCom[];
  currentUserId: string | null;
  onAddComment: (comment: string) => Promise<boolean>;
  onUpdateComment: (commentId: number, comment: string) => Promise<boolean>;
}

export function NomComs({
  nominationId,
  nomcoms,
  currentUserId,
  onAddComment,
  onUpdateComment,
}: NomComsProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit: SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const value = comment.trim();
    if (!value || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (await onAddComment(value)) setComment("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.nomcoms}>
      <span className={styles.eyebrow}>Nom Coms</span>
      <div className={styles.nomcomList}>
        {nomcoms.map((nomcom) => {
          return (
            <div className={styles.nomcomItem} key={nomcom.id}>
              <span
                className={`avatar avatar-${getColor(nomcom.commenter.name)}`}
              >
                {getInitials(nomcom.commenter.name)}
              </span>
              <div className={styles.commentContent}>
                <strong>{nomcom.commenter.name}</strong>
                <EditableComment
                  value={nomcom.comment ?? ""}
                  canEdit={nomcom.userId === currentUserId}
                  allowBlank={false}
                  emptyText=""
                  editLabel={`Edit ${nomcom.commenter.name}'s comment`}
                  inputLabel={`Comment from ${nomcom.commenter.name}`}
                  onSave={(comment) => onUpdateComment(nomcom.id, comment)}
                />
              </div>
            </div>
          );
        })}
      </div>
      <form className={styles.commentForm} onSubmit={submit}>
        <label
          className="srOnly"
          htmlFor={`nomination-comment-${nominationId}`}
        >
          Add a comment
        </label>
        <textarea
          id={`nomination-comment-${nominationId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Add to the discussion..."
          rows={2}
          required
        />
        <button type="submit" disabled={!comment.trim() || isSubmitting}>
          {isSubmitting ? "Posting..." : "Post comment"}
        </button>
      </form>
    </div>
  );
}
