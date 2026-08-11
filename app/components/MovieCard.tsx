import _ from "lodash";
import { useState, type SubmitEventHandler } from "react";
import { motion } from "motion/react";
import type { NomCom, Nomination, Vote } from "@/src/db/schema";
import styles from "./MovieCard.module.css";

interface MovieCardProps {
  nomination: Nomination;
  rank: number;
  hasUpvoted: boolean;
  canVote: boolean;
  isExpanded: boolean;
  onAddVote: () => void;
  onToggleDiscussion: () => void;
}

export function MovieCard({
  nomination,
  rank,
  hasUpvoted,
  canVote,
  isExpanded,
  onAddVote,
  onToggleDiscussion,
}: MovieCardProps) {
  const { movie, votes, nominator } = nomination;
  return (
    <>
      <article
        className={`${styles.card} ${isExpanded ? styles.activeCard : ""}`}
      >
        <button
          className={styles.posterButton}
          type="button"
          onClick={onToggleDiscussion}
          aria-expanded={false}
          aria-label={`Expand details for ${movie.title}`}
        >
          <div className={styles.poster}>
            {movie.posterUrl ? (
              <img src={movie.posterUrl} alt="" />
            ) : (
              <span>{movie.title.slice(0, 1)}</span>
            )}
            <span className={styles.rank}>{String(rank).padStart(2, "0")}</span>
            <span className={styles.posterShade} />
            <span className={styles.movieLabel}>
              <strong>{movie.title}</strong>
              <small>{movie.year ?? "Year unknown"}</small>
            </span>
          </div>
        </button>

        <div className={styles.meta}>
          {/* TODO: initials */}
          <span
            className={`avatar avatar-${getColor(movie.title)}`}
            title={`Nominated by ${nominator.name}`}
          >
            {nominator.name.slice(0, 1)}
          </span>
          <button
            className={`${styles.stat} ${hasUpvoted ? styles.voted : ""}`}
            type="button"
            onClick={onAddVote}
            disabled={!canVote}
            aria-label={`Give a vote to ${movie.title}`}
          >
            {votes.length} {votes.length === 1 ? "vote" : "votes"}
          </button>
        </div>
      </article>
    </>
  );
}

interface MovieDiscussionProps {
  nomination: Nomination;
  hasUpvoted: boolean;
  canVote: boolean;
  onAddVote: () => void;
  onRemoveVote: () => void;
  onAddComment: (comment: string) => Promise<boolean>;
  onMarkWatched?: () => void;
  onClose: () => void;
}

export function MovieDiscussion({
  nomination,
  hasUpvoted,
  canVote,
  onAddVote,
  onRemoveVote,
  onAddComment,
  onMarkWatched,
  onClose,
}: MovieDiscussionProps) {
  const { movie, votes, nominator, nomcoms } = nomination;
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
        aria-label={`Discussion about ${movie.title}`}
      >
        <div className={styles.expandedHeader}>
          <div className={styles.discussionHeading}>
            <div className={styles.discussionTitleRow}>
              <h2>{movie.title}</h2>
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
          </div>
          <div className={styles.voteActions}>
            <button
              className={styles.votePrimary}
              type="button"
              onClick={onAddVote}
              disabled={!canVote}
              aria-label={`Vote for ${movie.title}`}
            >
              Vote for this
            </button>
            <button
              className={styles.voteSecondary}
              type="button"
              onClick={onRemoveVote}
              disabled={!hasUpvoted}
              aria-label={`Remove your vote from ${movie.title}`}
            >
              Remove vote
            </button>
            <button
              className={styles.watched}
              type="button"
              onClick={onMarkWatched}
              aria-label={`Mark ${movie.title} as seen`}
            >
              Seen it
            </button>
          </div>
        </div>
        <div className={styles.nominationQuote}>
          <span className={`avatar avatar-${getColor(nominator.name)}`}>
            {getInitials(nominator.name)}
          </span>
          <div>
            <strong>{nominator.name}</strong>
            <p>{nomination.comment}</p>
          </div>
        </div>
        <VoterList votes={votes} />
        <NomComList
          nominationId={nomination.id}
          nomcoms={nomcoms}
          onAddComment={onAddComment}
        />
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

interface NomComListProps {
  nominationId: number;
  nomcoms: NomCom[];
  onAddComment: (comment: string) => Promise<boolean>;
}

function NomComList({ nominationId, nomcoms, onAddComment }: NomComListProps) {
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
      <span className={styles.eyebrow}>Comments</span>
      <div className={styles.nomcomList}>
        {nomcoms.map((nomcom) => {
          return (
            <p key={nomcom.id}>
              <span
                className={`avatar avatar-${getColor(nomcom.commenter.name)}`}
              >
                {getInitials(nomcom.commenter.name)}
              </span>
              <span>
                <strong>{nomcom.commenter.name}</strong>
                {nomcom.comment}
              </span>
            </p>
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

const getInitials = (name: string) => {
  const parts = name.split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
};

const getColor = (text: string) => {
  const colors = ["violet", "lilac", "mint", "gold"];
  const index =
    text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) %
    colors.length;
  return colors[index];
};
