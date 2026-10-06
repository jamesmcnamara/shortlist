import uniqBy from "lodash/uniqBy";

export interface ImportedMovie {
  id: number;
  title: string;
  year: number | null;
}

export type MovieImportResult =
  | { status: "not_found" }
  | { status: "added"; movie: ImportedMovie }
  | { status: "already_on_list"; movie: ImportedMovie };

export const parseMovieTitles = (input: string): string[] =>
  uniqBy(
    input
      .split(/\r\n?|\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    (title) => title.toLowerCase(),
  );
