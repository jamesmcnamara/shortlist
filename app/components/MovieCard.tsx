import type { Nomination } from "@/src/db/schema";
import styles from "./MovieCard.module.css";
import { getColor, getInitials } from "@/app/lib/utils";
import classnames from "classnames";

interface MovieCardProps {
  nomination: Nomination;
  rank: number;
  hasSeen: boolean;
  hasUpvoted: boolean;
  canVote: boolean;
  isExpanded: boolean;
  isCompleted?: boolean;
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
  isCompleted = false,
  onAddVote,
  onToggleDiscussion,
}: MovieCardProps) {
  const {
    movie: { details },
    votes,
    nominator,
    seenBy,
  } = nomination;
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
          <div
            className={classnames(styles.poster, {
              [styles.watchedPoster]: hasSeen || isCompleted,
            })}
          >
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
            className={classnames(styles.stat, { [styles.voted]: hasUpvoted })}
            type="button"
            onClick={onAddVote}
            disabled={!canVote}
            aria-label={`Give a vote to ${details.title}`}
          >
            {votes.length} <span>↑</span>
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
