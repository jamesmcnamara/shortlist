"use client";

import type { MDBRating } from "@/src/db/schema";
import { authClient } from "@/lib/auth/client";
import { heat, RATING_RANGES } from "@/app/lib/heat";
import { find } from "shades";
import Link from "next/link";
import styles from "./Ratings.module.css";

interface RatingProps {
  movieTitle: string;
  services: MDBRating[];
  wikipediaUrl?: string | null;
}

interface Rating {
  name: string;
  rating: number;
  range: [number, number];
  url: string;
  logo: string;
  value: string;
}

export function Ratings({ movieTitle, services, wikipediaUrl }: RatingProps) {
  const { data: session } = authClient.useSession();
  const sixDegreesUrl =
    session?.user.email === "jamesscottmcnamara@gmail.com"
      ? `https://p0wd43vp2t.local:3001/open/movie?title=${encodeURIComponent(movieTitle)}`
      : null;
  const imdb = find({ source: "imdb" })(services);
  const imdbTriviaUrl = imdb?.url?.replace(/\/?$/, "/trivia/") ?? null;
  const letterboxd = find({ source: "letterboxd" })(services);
  const tomatoes = find({ source: "tomatoes" })(services);
  const popcorn = find({ source: "popcorn" })(services);
  const ratings = [
    {
      name: "IMDb",
      rating: imdb?.value,
      range: RATING_RANGES.imdb,
      url: imdb?.url,
      logo: "/ratings/imdb.svg",
      value: !!imdb?.value ? `${imdb.value.toFixed(1)}/10` : null,
    },
    {
      name: "Letterboxd",
      rating: letterboxd?.value,
      range: RATING_RANGES.letterboxd,
      url: letterboxd?.url,
      logo: "/ratings/letterboxd.svg",
      value: !!letterboxd?.value ? `${letterboxd.value.toFixed(1)}/5` : null,
    },
    {
      name: "Rotten Tomatoes",
      rating: tomatoes?.value,
      range: RATING_RANGES.tomatoes,
      url: tomatoes?.url,
      logo: "/ratings/rottentomatoes.svg",
      value: !!tomatoes?.value ? `${Math.round(tomatoes.value)}%` : null,
    },
    {
      name: "Rotten Tomatoes audience",
      rating: popcorn?.value,
      range: RATING_RANGES.popcorn,
      url: popcorn?.url,
      logo: "/ratings/rottentomatoes-popcorn.svg",
      value: !!popcorn?.value ? `${Math.round(popcorn.value)}%` : null,
    },
  ].filter(
    (rating): rating is Rating =>
      rating.rating !== null && rating.url !== null && rating.value !== null,
  );

  if (ratings.length === 0 && !wikipediaUrl && !imdbTriviaUrl && !sixDegreesUrl)
    return null;

  return (
    <div className={styles.ratings} aria-label="Movie ratings">
      {ratings.map((rating) => (
        <a
          key={rating.name}
          className={`${styles.rating} ${styles.scored}`}
          style={{ background: heat(rating.rating, rating.range) }}
          href={rating.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${rating.name}: ${rating.value}. View on ${rating.name}`}
        >
          <img src={rating.logo} alt="" />
          <span>{rating.value}</span>
        </a>
      ))}
      {imdbTriviaUrl && (
        <a
          className={styles.rating}
          href={imdbTriviaUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Read trivia about this movie on IMDb"
          title="IMDb trivia"
        >
          <img src="/ratings/imdb.svg" alt="" />
          <span>Trivia</span>
        </a>
      )}
      {wikipediaUrl && (
        <a
          className={styles.rating}
          href={wikipediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Read about this movie on Wikipedia"
          title="Wikipedia"
        >
          <img src="/ratings/wikipedia.svg" alt="" />
        </a>
      )}
      {sixDegreesUrl && (
        <Link
          className={`${styles.rating} ${styles.sixDegrees}`}
          href={sixDegreesUrl}
          aria-label={`Open ${movieTitle} in 6 Degrees`}
          title="6 Degrees"
        >
          <img src="/ratings/six-degrees.svg" alt="" />
        </Link>
      )}
    </div>
  );
}
