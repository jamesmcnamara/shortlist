export interface Movie {
  id: number;
  title: string;
  nominatedByMe: boolean;
  voteCount: number;
  myVoteCount: number;
  year: number | null;
  posterUrl: string | null;
  nominationId: number | null;
}

export interface MovieMeta {
  nominator: string;
  initials: string;
  color: string;
  recommendation: string;
  upvotes: string[];
  comments: number;
}
