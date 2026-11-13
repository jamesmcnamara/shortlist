import {
  votersOf,
  type VoteAction,
} from "@/app/lib/extensions/movieclub/shared";
import type { Nomination } from "@/src/db/schema";
import { filter } from "shades";
import classnames from "classnames";
import styles from "./MovieClubVotes.module.css";

interface MovieClubVotesProps {
  nomination: Nomination;
  userId: string | undefined;
  votesLeft: number;
  disabled?: boolean;
  /** Only passed when the viewer can vote on this movie. */
  onVote?: (action: VoteAction) => void;
}

export function MovieClubVotes({
  nomination,
  userId,
  votesLeft,
  disabled = false,
  onVote,
}: MovieClubVotesProps) {
  const voters = votersOf(nomination);
  const myVotes = filter({ id: userId })(voters).length;
  const title = nomination.movie.details.title;

  return (
    <div
      className={classnames(styles.controls, {
        [styles.voted]: myVotes > 0,
        [styles.readOnly]: !onVote,
      })}
      role="group"
      aria-label={`${onVote ? "Your votes" : "Upvotes"} for ${title}`}
    >
      {onVote && (
        <button
          type="button"
          className={styles.adjust}
          aria-label={`Remove a vote from ${title}`}
          disabled={disabled || myVotes === 0}
          onClick={() => onVote("unvote")}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 10h10" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <span className={styles.count} role="status">
        <span
          role="img"
          aria-label={`${voters.length} ${voters.length === 1 ? "upvote" : "upvotes"}`}
        >
          {voters.length}
        </span>
        {myVotes > 0 && <small>{myVotes} from you</small>}
      </span>
      {onVote && (
        <button
          type="button"
          className={styles.adjust}
          aria-label={`Upvote ${title}`}
          title={votesLeft <= 0 ? "You're out of votes this month" : undefined}
          disabled={disabled || votesLeft <= 0}
          onClick={() => onVote("vote")}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 10h10m-5-5v10" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
