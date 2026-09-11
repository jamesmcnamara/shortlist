import type { MDBRating } from "@/src/db/schema";
import { find } from "shades";
import styles from "./MovieRatings.module.css";

interface RatingProps {
  name: string;
  rating: number;
  url: string;
  logo: string;
  value: string;
}

export function MovieRatings({ services }: { services: MDBRating[] }) {
  const imdb = find({ source: "imdb" })(services);
  const letterboxd = find({ source: "letterboxd" })(services);
  const tomatoes = find({ source: "tomatoes" })(services);
  const popcorn = find({ source: "popcorn" })(services);
  const ratings = [
    {
      name: "IMDb",
      rating: imdb?.value,
      url: imdb?.url,
      logo: "/ratings/imdb.svg",
      value: !!imdb?.value ? `${imdb.value.toFixed(1)}/10` : null,
    },
    {
      name: "Letterboxd",
      rating: letterboxd?.value,
      url: letterboxd?.url,
      logo: "/ratings/letterboxd.svg",
      value: !!letterboxd?.value ? `${letterboxd.value.toFixed(1)}/5` : null,
    },
    {
      name: "Rotten Tomatoes",
      rating: tomatoes?.value,
      url: tomatoes?.url,
      logo: "/ratings/rottentomatoes.svg",
      value: !!tomatoes?.value ? `${Math.round(tomatoes.value)}%` : null,
    },
    {
      name: "Rotten Tomatoes audience",
      rating: popcorn?.value,
      url: popcorn?.url,
      logo: "/ratings/rottentomatoes-popcorn.svg",
      value: !!popcorn?.value ? `${Math.round(popcorn.value)}%` : null,
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
