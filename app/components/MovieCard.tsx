import _ from "lodash";
import {find} from 'shades'
import { useState, type SubmitEventHandler } from "react";
import { motion } from "motion/react";
import type { NomCom, Nomination, Vote, Movie, RatingSource, MovieRatings, MDBRating, User } from "@/src/db/schema";
import styles from "./MovieCard.module.css";

interface MovieCardProps {
  nomination: Nomination;
  rank: number;
  hasSeen: boolean;
  hasUpvoted: boolean;
  canVote: boolean;
  isExpanded: boolean;
  onAddVote: () => void;
  onToggleDiscussion: () => void;
}

export function MovieCard({
  nomination,
  rank,
  hasSeen,
  hasUpvoted,
  canVote,
  isExpanded,
  onAddVote,
  onToggleDiscussion,
}: MovieCardProps) {
  const { movie: {details}, votes, nominator, seenBy } = nomination;
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
          aria-label={`Expand details for ${details.title}`}
        >
          <div className={`${styles.poster} ${hasSeen ? styles.watchedPoster : ""}`}>
            {details.posterUrl ? (
              <img src={details.posterUrl} alt="" />
            ) : (
              <span>{details.title.slice(0, 1)}</span>
            )}
            <span className={styles.rank}>{String(rank).padStart(2, "0")}</span>
            <span className={styles.posterShade} />
            <span className={styles.movieLabel}>
              <strong>{details.title}</strong>
              <small>{details.year ?? "Year unknown"}</small>
            </span>
          </div>
        </button>

        <div className={styles.meta}>
          <span
            className={`avatar avatar-${getColor(details.title)}`}
            title={`Nominated by ${nominator.name}`}
          >
            {getInitials(nominator.name)}
          </span>
          <button
            className={`${styles.stat} ${hasUpvoted ? styles.voted : ""}`}
            type="button"
            onClick={onAddVote}
            disabled={!canVote}
            aria-label={`Give a vote to ${details.title}`}
          >
            {votes.length} {votes.length === 1 ? "vote" : "votes"}
          </button>
          {seenBy.length > 0 && (
            <span
              className={styles.seenCount}
              title={`Seen by ${seenBy.map((user) => user.name).join(", ")}`}
            >
              👁 {seenBy.length}
            </span>
          )}
        </div>
      </article>
    </>
  );
}

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
  onClose,
}: MovieDiscussionProps) {
  const { movie: {details, ratings}, votes, nominator, nomcoms, seenBy } = nomination;
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
          </div>
          <MovieRatings services={ratings.services} />
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
        <NomComList
          nominationId={nomination.id}
          nomcoms={nomcoms}
          currentUserId={currentUserId}
          onAddComment={onAddComment}
          onUpdateComment={onUpdateComment}
        />
      </section>
    </motion.div>
  );
}

interface RatingProps {
  name: string;
  rating: number;
  url: string;
  logo: string;
  value: string;
}

function MovieRatings({services}: { services: MDBRating[]}) {
  const imdb = find({source: "imdb"})(services);
  const letterboxd = find({source: "letterboxd"})(services);
  const tomatoes = find({source: "tomatoes"})(services);
  const popcorn = find({source: "popcorn"})(services);
  const ratings = [
    {
      name: "IMDb",
      rating: imdb?.value,
      url: imdb?.url,
      logo: "/ratings/imdb.svg",
      value: !!imdb?.value  ? `${imdb.value.toFixed(1)}/10` : null,
    },
    {
      name: "Letterboxd",
      rating: letterboxd?.value,
      url: letterboxd?.url,
      logo: "/ratings/letterboxd.svg",
      value:
        !!letterboxd?.value ? `${letterboxd.value.toFixed(1)}/5` : null,
    },
    {
      name: "Rotten Tomatoes",
      rating: tomatoes?.value,
      url: tomatoes?.url,
      logo: "/ratings/rottentomatoes.svg",
      value:
        !!tomatoes?.value
          ? `${Math.round(tomatoes.value)}%`
          : null,
    },
    {
      name: "Rotten Tomatoes audience",
      rating: popcorn?.value,
      url: popcorn?.url,
      logo: "/ratings/rottentomatoes-popcorn.svg",
      value:
        !!popcorn?.value
          ? `${Math.round(popcorn.value)}%`
          : null,
    },
  ].filter(
    (rating): rating is RatingProps =>
      rating.rating !== null && rating.url !== null && rating.value !== null,
  );

  if (ratings.length === 0) return null;

  return (
    <div className={styles.ratings} aria-label="Movie ratings">
      {ratings.map((rating) => (
        <a
          key={rating.name}
          className={styles.rating}
          href={rating.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${rating.name}: ${rating.value}. View on ${rating.name}`}
        >
          <img src={rating.logo} alt="" />
          <span>{rating.value}</span>
        </a>
      ))}
    </div>
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

/** Room members who have marked this movie seen; empty is the common case. */
function SeenByList({ seenBy }: { seenBy: User[] }) {
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

interface NomComListProps {
  nominationId: number;
  nomcoms: NomCom[];
  currentUserId: string | null;
  onAddComment: (comment: string) => Promise<boolean>;
  onUpdateComment: (commentId: number, comment: string) => Promise<boolean>;
}

function NomComList({
  nominationId,
  nomcoms,
  currentUserId,
  onAddComment,
  onUpdateComment,
}: NomComListProps) {
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

interface EditableCommentProps {
  value: string;
  canEdit: boolean;
  allowBlank: boolean;
  emptyText: string;
  editLabel: string;
  inputLabel: string;
  onSave: (comment: string) => Promise<boolean>;
}

function EditableComment({
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
