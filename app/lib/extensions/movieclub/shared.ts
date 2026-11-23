import { hasExtension, type NotificationCategory } from "@/app/lib/extensions";
import type { Nomination, Person } from "@/src/db/schema";

export const VOTES_PER_MONTH = 5;

export const CLUB_NOTIFICATIONS: NotificationCategory[] = [
  {
    id: "lead",
    label: "Your movie takes the lead",
    description: "When your nomination moves into first place, or ties for it.",
  },
  {
    id: "reminder",
    label: "Nomination reminder",
    description:
      "The evening before the last day of the month, if you haven't nominated yet.",
  },
];

export type VoteAction = "vote" | "unvote";

export const isMovieClub = (description?: string | null) =>
  hasExtension("movieclub", description);

/** One entry per vote; the same person can appear more than once. */
export const votersOf = ({ extensions }: Pick<Nomination, "extensions">) =>
  extensions?.movieclub?.voters ?? [];

export const isClubPick = ({ extensions }: Pick<Nomination, "extensions">) =>
  extensions?.movieclub?.isPick === true;

export interface MovieClubTheatreExtension {
  /** One nomination id per vote, by month then user, like `{ "2026-11": { [userId]: [3, 3, 7] } }`. */
  votes?: Record<string, Record<string, number[]>>;
  /** The movie id chosen for each month, like `{ "2026-11": 42 }`. */
  picks?: Record<string, number>;
  cycle?: string;
}

export interface MovieClubNominationExtension {
  voters?: Person[];
  isPick?: boolean;
}

export const emptyNominationClubExtensions: MovieClubNominationExtension = {
  voters: [],
  isPick: false,
};
