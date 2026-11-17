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
  (extensions?.movieclub as { voters?: Person[] } | undefined)?.voters ?? [];
