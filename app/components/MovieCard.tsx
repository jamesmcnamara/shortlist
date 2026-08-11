import { useState, type SubmitEventHandler} from "react";
import type { NomCom, Nomination, Vote } from "@/src/db/schema";
import styles from "./MovieCard.module.css";

interface MovieCardProps {
  nomination: Nomination;
  rank: number;
  hasUpvoted: boolean;
  canVote: boolean;
  onAddVote: () => void;
  onToggleDiscussion: () => void;
};

export function MovieCard({
  nomination,
  rank,
  hasUpvoted,
  canVote,
  onAddVote,
  onToggleDiscussion
}: MovieCardProps) {
  const {movie, votes, nominator} = nomination
  return (
    <>
      <article className={styles.card}>
        <button
          className={styles.posterButton}
          type="button"
          onClick={onToggleDiscussion}
          aria-expanded={false}
          aria-label={`Expand details for ${movie.title}`}
        >
          <div className={styles.poster}>
            {movie.posterUrl ? <img src={movie.posterUrl} alt="" /> : <span>{movie.title.slice(0, 1)}</span>}
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
          <span className={`avatar avatar-${getColor(movie.title)}`} title={`Nominated by ${nominator.name}`}>{nominator.name.slice(0, 1)}</span>
          <button
            className={`${styles.stat} ${hasUpvoted ? styles.voted : ""}`}
            type="button"
            onClick={onAddVote}
            disabled={!canVote}
            aria-label={`Give a vote to ${movie.title}`}
          >
            <span aria-hidden="true">↑</span>{votes.length}
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
}

export function MovieDiscussion({
  nomination,
  hasUpvoted,
  canVote,
  onAddVote,
  onRemoveVote,
  onAddComment,
  onMarkWatched
}: MovieDiscussionProps) {
  const {movie, votes, nominator, nomcoms} = nomination;
  return (
    <section className={styles.expanded} aria-label={`Discussion about ${movie.title}`}>
          <div className={styles.expandedHeader}>
            <div className={styles.nominator}>
              {/* TODO: initials */}
              <span className={`avatar avatar-${getColor(movie.title)}`}>TK</span>
              <div>
                <span className={styles.eyebrow}>Nominated by</span>
                <strong>{nominator.name}</strong>
              </div>
            </div>
            <div className={styles.voteActions}>
              <button className={styles.votePrimary} type="button" onClick={onAddVote} disabled={!canVote}>Upvote <span>↑</span></button>
              <button className={styles.voteSecondary} type="button" onClick={onRemoveVote} disabled={!hasUpvoted}>Remove vote</button>
              <button className={styles.watched} type="button" onClick={onMarkWatched}>Seen it<span>✓</span></button>
            </div>
          </div>
          <p className={styles.recommendation}>“{nomination.comment}”</p>
          <VoterList votes={votes} />
          <NomComList nominationId={nomination.id} nomcoms={nomcoms} onAddComment={onAddComment} />
    </section>
  );
}

interface VoterListProps {
  votes: Vote[];
}

function VoterList({ votes }: VoterListProps) {
  return (
    <div className={styles.voters}>
      <span className={styles.eyebrow}>Voted for this</span>
      <div className={styles.voterList}>
        {votes.map((vote) => {
          const voter = vote.userId === "james" ? "JM" : vote.userId === "maya" ? "MK" : vote.userId === "theo" ? "TH" : "RA";
          const color = vote.userId === "james" ? "violet" : vote.userId === "maya" ? "lilac" : vote.userId === "theo" ? "mint" : "gold";
          return <span key={vote.id} className={`avatar avatar-${color}`} title={vote.userId}>{voter}</span>;
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
              <span className={`avatar avatar-${getColor(nomcom.commenter.name)}`}>{getInitials(nomcom.commenter.name)}</span>
              <span><strong>{nomcom.commenter.name}</strong> “{nomcom.comment}”</span>
            </p>
          );
        })}
      </div>
      <form className={styles.commentForm} onSubmit={submit}>
        <label className="srOnly" htmlFor={`nomination-comment-${nominationId}`}>Add a comment</label>
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
}

const getColor = (text: string) => {
  const colors = ["violet", "lilac", "mint", "gold"];
  const index = text.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
}