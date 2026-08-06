import styles from "./MovieCard.module.css";
import type { Movie, MovieMeta } from "./shortlist-types";

type MovieCardProps = {
  movie: Movie;
  meta: MovieMeta;
  rank: number;
  hasUpvoted: boolean;
  onToggleUpvote: () => void;
  onToggleDiscussion: () => void;
};

export function MovieCard({
  movie,
  meta,
  rank,
  hasUpvoted,
  onToggleUpvote,
  onToggleDiscussion
}: MovieCardProps) {
  const upvoteCount = meta.upvotes.length + (hasUpvoted ? 1 : 0);

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
          <span className={`avatar avatar-${meta.color}`} title={`Nominated by ${meta.nominator}`}>{meta.initials}</span>
          <button
            className={`${styles.stat} ${hasUpvoted ? styles.voted : ""}`}
            type="button"
            onClick={onToggleUpvote}
            aria-label={`${hasUpvoted ? "Remove upvote from" : "Upvote"} ${movie.title}`}
            aria-pressed={hasUpvoted}
          >
            <span aria-hidden="true">↑</span>{upvoteCount}
          </button>
          <button className={styles.stat} type="button" onClick={onToggleDiscussion} aria-expanded={false} aria-label={`${meta.comments} comments on ${movie.title}`}>
            <span aria-hidden="true">☷</span>{meta.comments}
          </button>
        </div>
      </article>

    </>
  );
}

export function MovieDiscussion({
  movie,
  meta,
  hasUpvoted,
  onMarkWatched
}: Pick<MovieCardProps, "movie" | "meta"> & { hasUpvoted: boolean; onMarkWatched: () => void }) {
  const voters = hasUpvoted && !meta.upvotes.includes("James") ? ["James", ...meta.upvotes] : meta.upvotes;

  return (
    <section className={styles.expanded} aria-label={`Discussion about ${movie.title}`}>
          <div className={styles.expandedHeader}>
            <div className={styles.nominator}>
              <span className={`avatar avatar-${meta.color}`}>{meta.initials}</span>
              <div>
                <span className={styles.eyebrow}>Nominated by</span>
                <strong>{meta.nominator}</strong>
              </div>
            </div>
            <button className={styles.watched} type="button" onClick={onMarkWatched}>Mark watched <span>✓</span></button>
          </div>
          <p className={styles.recommendation}>“{meta.recommendation}”</p>
          <div className={styles.voters}>
            <span className={styles.eyebrow}>Voted for this</span>
            <div className={styles.voterList}>
              {voters.map((name) => {
                const voter = name === "James" ? "JM" : name === "Maya" ? "MK" : name === "Theo" ? "TH" : "RA";
                const color = name === "James" ? "violet" : name === "Maya" ? "lilac" : name === "Theo" ? "mint" : "gold";
                return <span key={name} className={`avatar avatar-${color}`} title={name}>{voter}</span>;
              })}
            </div>
          </div>
          <div className={styles.commentsFooter}>
            <span className={styles.eyebrow}>Comments · {meta.comments}</span>
            <div className={styles.commentList}>
              <p><span className="avatar avatar-lilac">MK</span><span><strong>Maya</strong> “The soundtrack alone.”</span></p>
              <p><span className="avatar avatar-mint">TH</span><span><strong>Theo</strong> “I’m in.”</span></p>
            </div>
            <button type="button" className={styles.commentLink}>Add a thought <span>→</span></button>
          </div>
    </section>
  );
}
