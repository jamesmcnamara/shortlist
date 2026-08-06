export type Movie = {
  id: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
};

export type MovieMeta = {
  nominator: string;
  initials: string;
  color: string;
  recommendation: string;
  upvotes: string[];
  comments: number;
};
