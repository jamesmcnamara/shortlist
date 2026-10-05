import { getColor, getInitials } from "@/app/lib/utils";
import type { Nomination, User } from "@/src/db/schema";
import { motion } from "motion/react";
import styles from "./MovieDiscussion.module.css";
import { MovieRatings } from "@/app/components/MovieRatings";
import { NomComs } from "./NomComs";
import { EditableComment } from "./EditableComment";
import { useClickOutside } from "@/app/lib/useClickOutside";

interface MovieDiscussionProps {
  nomination: Nomination;
  hasSeen: boolean;
  currentUserId: string | null;
  onAddComment: (comment: string) => Promise<boolean>;
  onUpdateNominationComment: (comment: string) => Promise<boolean>;
  onUpdateComment: (commentId: number, comment: string) => Promise<boolean>;
  onMarkWatched?: () => void;
  onDelete?: () => void;
  onToggleCompleted?: () => void;
  onClose: () => void;
}

export function MovieDiscussion({
  nomination,
  hasSeen,
  currentUserId,
  onAddComment,
  onUpdateNominationComment,
  onUpdateComment,
  onMarkWatched,
  onDelete,
  onToggleCompleted,
  onClose,
}: MovieDiscussionProps) {
  const {
    movie: { details, ratings },
    nominator,
    nomcoms,
    seenBy,
  } = nomination;
  const drawerRef = useClickOutside<HTMLDivElement>(onClose);
  return (
    <motion.div
      ref={drawerRef}
      className={styles.discussionDrawer}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
    >
      <section
        className={styles.expanded}
        aria-label={`Discussion about ${details.title}`}
      >
        <div className={styles.expandedHeader}>
          <div className={styles.discussionHeading}>
            <div className={styles.discussionTitleRow}>
              <h2>{details.title}</h2>
              <button
                className={styles.closeDiscussion}
                type="button"
                onClick={onClose}
                aria-label="Close discussion"
              >
                ✕
              </button>
            </div>
            <span className={styles.discussionMeta}>
              Nominated by {nominator.name}
            </span>
            {details.overview && (
              <p className={styles.recommendation}>{details.overview}</p>
            )}
          </div>
          <p className={styles.runtime}>
            {details.year ?? "Unknown"} • {toHrs(details.runtime)}
          </p>
          <MovieRatings services={ratings.services} />
          {!nomination.completed && (
            <div className={styles.movieActions}>
              <button
                className={`${styles.watched} ${hasSeen ? styles.voted : ""}`}
                type="button"
                onClick={onMarkWatched}
                aria-pressed={hasSeen}
                aria-label={
                  hasSeen
                    ? `Unmark ${details.title} as seen`
                    : `Mark ${details.title} as seen`
                }
              >
                {hasSeen ? "Seen it ✓" : "Seen it"}
              </button>
              {onDelete && (
                <button
                  className={styles.deleteMovie}
                  type="button"
                  onClick={onDelete}
                  aria-label={`Delete ${details.title} from the watchlist`}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
        <div className={styles.nominationQuote}>
          <span className={`avatar avatar-${getColor(nominator.name)}`}>
            {getInitials(nominator.name)}
          </span>
          <div className={styles.commentContent}>
            <strong>{nominator.name}</strong>
            <EditableComment
              value={nomination.comment ?? ""}
              canEdit={nomination.userId === currentUserId}
              allowBlank
              emptyText=""
              editLabel={`Edit ${details.title} nomination comment`}
              inputLabel={`Nomination comment for ${details.title}`}
              onSave={onUpdateNominationComment}
            />
          </div>
        </div>
        <SeenByList seenBy={seenBy} />
        {onToggleCompleted && (
          <div className={styles.adminActions}>
            <button
              className={`${styles.completeToggle} ${nomination.completed ? styles.completeToggleActive : ""}`}
              type="button"
              onClick={onToggleCompleted}
              aria-pressed={nomination.completed}
              aria-label={
                nomination.completed
                  ? `Move ${details.title} out of Watched`
                  : `Mark ${details.title} completed`
              }
            >
              {nomination.completed ? "Completed ✓" : "Mark completed"}
            </button>
          </div>
        )}
      </section>
    </motion.div>
  );
}

interface SeenByListProps {
  seenBy: User[];
}

/** Room members who have marked this movie seen; empty is the common case. */
function SeenByList({ seenBy }: SeenByListProps) {
  if (seenBy.length === 0) return null;
  return (
    <div className={styles.voters}>
      <span className={styles.voterCount}>
        Seen by {seenBy.length} {seenBy.length === 1 ? "person" : "people"}
      </span>
      <div className={styles.voterList}>
        {seenBy.map((user) => (
          <span
            key={user.id}
            className={`${styles.voter} avatar avatar-${getColor(user.name)}`}
            title={user.name}
          >
            {getInitials(user.name)}
          </span>
        ))}
      </div>
    </div>
  );
}

const toHrs = (minutes?: number) => {
  if (minutes === undefined || minutes === null || isNaN(minutes))
    return "Unknown";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
};
