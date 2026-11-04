import { Ratings } from "@/app/components/Ratings";
import { Streaming } from "@/app/components/Streaming";
import { useClickOutside } from "@/app/lib/useClickOutside";
import { getColor, getInitials, when } from "@/app/lib/utils";
import { userPath } from "@/lib/user-path";
import type { Nomination, Person } from "@/src/db/schema";
import classnames from "classnames";
import { motion } from "motion/react";
import Link from "next/link";
import { BoxOffice } from "../BoxOffice";
import { Oscars } from "../Oscars";
import { EditableComment } from "./EditableComment";
import styles from "./MovieDiscussion.module.css";
import { NomComs } from "./NomComs";

interface MovieDiscussionProps {
  nomination: Nomination;
  hasSeen: boolean;
  currentUserId: string | null;
  onUpdateComment?: (comment: string) => Promise<boolean>;
  onAddNomCom?: (comment: string) => Promise<boolean>;
  onUpdateNomCom?: (nomcomId: number, comment: string) => Promise<boolean>;
  onMarkWatched?: () => void;
  onDelete?: () => void;
  onToggleCompleted?: () => void;
  onRefreshJustWatch?: () => Promise<void>;
  onRefreshBoxOffice?: () => Promise<void>;
  onClose: () => void;
}

export function MovieDiscussion({
  nomination,
  hasSeen,
  currentUserId,
  onUpdateComment,
  onAddNomCom,
  onUpdateNomCom,
  onMarkWatched,
  onDelete,
  onToggleCompleted,
  onRefreshJustWatch,
  onRefreshBoxOffice,
  onClose,
}: MovieDiscussionProps) {
  const {
    movie: { details, ratings },
    nominator,
    seenBy,
  } = nomination;
  const drawerRef = useClickOutside<HTMLElement>(onClose);
  return (
    <motion.div
      className={styles.discussionDrawer}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 380, damping: 38 }}
    >
      <section
        ref={drawerRef}
        className={styles.expanded}
        aria-label={`Discussion about ${details.title}`}
      >
        <div className={styles.expandedHeader}>
          <div className={styles.discussionTitleRow}>
            {details.posterUrl ? (
              <img src={details.posterUrl} alt="" className={styles.poster} />
            ) : (
              <div className={styles.poster} aria-hidden="true" />
            )}
            <div className={styles.discussionHeading}>
              <h2>{details.title}</h2>
              <Link
                href={userPath(nominator.username)}
                className={styles.discussionMeta}
              >
                Nominated by {nominator.name}
              </Link>
            </div>
            <button
              className={styles.closeDiscussion}
              type="button"
              onClick={onClose}
              aria-label="Close discussion"
            >
              ✕
            </button>
          </div>
          {details.overview && (
            <p className={styles.recommendation}>{details.overview}</p>
          )}
          <div className={styles.runtimeRow}>
            <p className={styles.runtime}>
              {details.year ?? "Unknown"} • {toHrs(details.runtime)}
            </p>
            {onToggleCompleted && (
              <button
                className={classnames(styles.completeToggle, {
                  [styles.completeToggleActive]: nomination.completedAt,
                })}
                type="button"
                onClick={onToggleCompleted}
                aria-pressed={Boolean(nomination.completedAt)}
                aria-label={
                  nomination.completedAt
                    ? `Move ${details.title} out of Watched`
                    : `Mark ${details.title} as Watched`
                }
              >
                {nomination.completedAt ? "Completed ✓" : "Watched"}
              </button>
            )}
          </div>
          <Oscars movie={nomination.movie} />
          <Ratings
            services={ratings.services}
            wikipediaUrl={details.wikipediaUrl}
          />
          <BoxOffice data={details.boxOffice} onRefresh={onRefreshBoxOffice} />
          <Streaming
            availability={details.justWatch}
            onRefresh={onRefreshJustWatch}
          />
          {!nomination.completedAt && onMarkWatched && (
            <div className={styles.movieActions}>
              <button
                className={styles.watched}
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
          <Link
            href={userPath(nominator.username)}
            className={`avatar avatar-${getColor(nominator.name)}`}
            aria-label={`View ${nominator.name}'s theatres`}
          >
            {getInitials(nominator.name)}
          </Link>
          <div className={styles.commentContent}>
            <strong>{nominator.name}</strong>
            <EditableComment
              value={nomination.comment ?? ""}
              allowBlank
              emptyText=""
              editLabel={`Edit ${details.title} nomination comment`}
              inputLabel={`Nomination comment for ${details.title}`}
              onSave={when(nomination.userId === currentUserId)(
                onUpdateComment,
              )}
            />
          </div>
        </div>
        <SeenByList seenBy={seenBy} />
        <NomComs
          nominationId={nomination.id}
          nomcoms={nomination.nomcoms}
          currentUserId={currentUserId}
          onAddComment={onAddNomCom}
          onUpdateComment={onUpdateNomCom}
        />
      </section>
    </motion.div>
  );
}

interface SeenByListProps {
  seenBy: Person[];
}

/** Theatre members who have marked this movie seen; empty is the common case. */
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
