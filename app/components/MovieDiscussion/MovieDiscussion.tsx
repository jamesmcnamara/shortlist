import { getColor, getInitials } from "@/app/lib/utils";
import type { Nomination, User, Vote } from "@/src/db/schema";
import _ from "lodash";
import { motion } from "motion/react";
import styles from "./MovieDiscussion.module.css";
import { MovieRatings } from "./MovieRatings";
import { NomComs } from "./NomComs";
import { EditableComment } from "./EditableComment";

interface MovieDiscussionProps {
  nomination: Nomination;
  hasUpvoted: boolean;
  hasSeen: boolean;
  canVote: boolean;
  currentUserId: string | null;
  onAddVote: () => void;
  onRemoveVote: () => void;
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
  hasUpvoted,
  hasSeen,
  canVote,
  currentUserId,
  onAddVote,
  onRemoveVote,
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
    votes,
    nominator,
    nomcoms,
    seenBy,
  } = nomination;
  return (
    <motion.div
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
          <MovieRatings services={ratings.services} />
          {!nomination.completed && (
            <div className={styles.voteActions}>
              <button
                className={styles.votePrimary}
                type="button"
                onClick={onAddVote}
                disabled={!canVote}
                aria-label={`Vote for ${details.title}`}
              >
                Vote for this
              </button>
              <button
                className={styles.voteSecondary}
                type="button"
                onClick={onRemoveVote}
                disabled={!hasUpvoted}
                aria-label={`Remove your vote from ${details.title}`}
              >
                Remove vote
              </button>
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
              emptyText="No pitch yet."
              editLabel={`Edit ${details.title} nomination comment`}
              inputLabel={`Nomination comment for ${details.title}`}
              onSave={onUpdateNominationComment}
            />
          </div>
        </div>
        <VoterList votes={votes} />
        <SeenByList seenBy={seenBy} />
        <NomComs
          nominationId={nomination.id}
          nomcoms={nomcoms}
          currentUserId={currentUserId}
          onAddComment={onAddComment}
          onUpdateComment={onUpdateComment}
        />
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

interface VoterListProps {
  votes: Vote[];
}

function VoterList({ votes }: VoterListProps) {
  const groups = _.groupBy(votes, (vote) => vote.voter.name);
  return (
    <div className={styles.voters}>
      <span className={styles.voterCount}>
        {votes.length} {votes.length === 1 ? "vote" : "votes"} so far
      </span>
      <div className={styles.voterList}>
        {Object.entries(groups).map(([name, votes]) => {
          const count = votes.length;
          return (
            <span
              key={name}
              className={`${styles.voter} avatar avatar-${getColor(name)}`}
              title={`${name}: ${count} ${count === 1 ? "vote" : "votes"}`}
            >
              {getInitials(name)}
              {count > 1 && <small>{count}</small>}
            </span>
          );
        })}
      </div>
    </div>
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
