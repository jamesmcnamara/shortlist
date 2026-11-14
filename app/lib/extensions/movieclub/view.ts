import type { SortOption } from "@/app/lib/view";
import { isMovieClub, votersOf } from "./shared";

export const VOTES_SORT: SortOption = {
  id: "votes",
  label: "Most upvotes",
  compare: (a, b) =>
    votersOf(b).length - votersOf(a).length ||
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
};

const CLUB_SORTS = [VOTES_SORT];
const NO_SORTS: SortOption[] = [];

export const movieClubSorts = (description?: string | null) =>
  isMovieClub(description) ? CLUB_SORTS : NO_SORTS;
