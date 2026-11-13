import { hasExtension } from "@/app/lib/extensions";
import type { Nomination, Person } from "@/src/db/schema";

export const VOTES_PER_MONTH = 5;

export type VoteAction = "vote" | "unvote";

export const isMovieClub = (description?: string | null) =>
  hasExtension("movieclub", description);

/** One entry per vote; the same person can appear more than once. */
export const votersOf = ({ extensions }: Pick<Nomination, "extensions">) =>
  (extensions?.movieclub as { voters?: Person[] } | undefined)?.voters ?? [];
