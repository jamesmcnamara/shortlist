import type { NomCom } from "@/src/db/schema";
import { useState, type SubmitEventHandler } from "react";
import styles from "./MovieDiscussion.module.css";
import { getColor, getInitials, when } from "@/app/lib/utils";
import { EditableComment } from "./EditableComment";
import Link from "next/link";
import { userPath } from "@/lib/user-path";

interface NomComsProps {
  nominationId: number;
  nomcoms: NomCom[];
  currentUserId: string | null;
  onAddComment?: (comment: string) => Promise<boolean>;
  onUpdateComment?: (commentId: number, comment: string) => Promise<boolean>;
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
    if (!value || isSubmitting || !onAddComment) return;

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
              <Link
                href={userPath(nomcom.commenter.id)}
                className={`avatar avatar-${getColor(nomcom.commenter.name)}`}
                aria-label={`View ${nomcom.commenter.name}'s theatres`}
              >
                {getInitials(nomcom.commenter.name)}
              </Link>
              <div className={styles.commentContent}>
                <strong>{nomcom.commenter.name}</strong>
                <EditableComment
                  value={nomcom.comment ?? ""}
                  allowBlank={false}
                  emptyText=""
                  editLabel={`Edit ${nomcom.commenter.name}'s comment`}
                  inputLabel={`Comment from ${nomcom.commenter.name}`}
                  onSave={when(
                    !!onUpdateComment && nomcom.userId === currentUserId,
                  )((comment) => onUpdateComment!(nomcom.id, comment))}
                />
              </div>
            </div>
          );
        })}
      </div>
      {onAddComment && (
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
      )}
    </div>
  );
}
