import type { Nomination } from "@/src/db/schema";
import styles from "./MovieCard.module.css";
import { getColor, getInitials } from "@/app/lib/utils";
import classnames from "classnames";
import { useLongPress } from "@/app/lib/useLongPress";

interface MovieCardProps {
  nomination: Nomination;
  rank: number;
  hasSeen: boolean;
  showMeta: boolean;
  isExpanded: boolean;
  isCompleted?: boolean;
  /** Set while picking movies to compare; undefined otherwise. */
  isSelected?: boolean;
  onClick: () => void;
  onLongPress: () => void;
}

export function MovieCard({
  nomination,
  rank,
  hasSeen,
  showMeta,
  isExpanded,
  isCompleted = false,
  isSelected,
  onClick,
  onLongPress,
}: MovieCardProps) {
  const longPress = useLongPress(onLongPress);
  const isSelecting = isSelected !== undefined;
  const {
    movie: { details },
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
          onClick={onClick}
          {...longPress}
          aria-expanded={isSelecting ? undefined : false}
          aria-pressed={isSelected}
          aria-label={
            isSelecting
              ? `Select ${details.title} to compare`
              : `Expand details for ${details.title}`
          }
        >
          <div
            className={classnames(styles.poster, {
              [styles.watchedPoster]: hasSeen || isCompleted,
              [styles.selectedPoster]: isSelected,
            })}
          >
            {details.posterUrl ? (
              <img src={details.posterUrl} alt="" draggable={false} />
            ) : (
              <span>{details.title.slice(0, 1)}</span>
            )}
            <span className={styles.rank}>{String(rank).padStart(2, "0")}</span>
            <span className={styles.posterShade} />
            {isSelecting && (
              <span className={styles.selectMark} aria-hidden="true" />
            )}
            <span className={styles.movieLabel}>
              <strong>{details.title}</strong>
              <small>{details.year ?? "Year unknown"}</small>
            </span>
          </div>
        </button>

        {showMeta && (
          <div className={styles.meta}>
            <span
              className={`avatar avatar-${getColor(details.title)}`}
              title={`Nominated by ${nominator.name}`}
            >
              {getInitials(nominator.name)}
            </span>
            {seenBy.length > 0 && (
              <span
                className={styles.seenCount}
                title={`Seen by ${seenBy.map((user) => user.name).join(", ")}`}
              >
                👁 {seenBy.length}
              </span>
            )}
          </div>
        )}
      </article>
    </>
  );
}
