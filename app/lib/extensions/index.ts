import { extract } from "@/app/lib/tags";

/** Opt-in list behaviors. Each is turned on by the hashtag with its name. */
export const EXTENSIONS = ["specific", "movieclub"] as const;

export type ExtensionName = (typeof EXTENSIONS)[number];

/** Other hashtags that turn an extension on, besides its own name. */
const ALIASES: Partial<Record<ExtensionName, string[]>> = {
  movieclub: ["movie-club"],
};

export const isExtension = (name: string): name is ExtensionName =>
  (EXTENSIONS as readonly string[]).includes(name);

export const hasExtension = (
  name: ExtensionName,
  description?: string | null,
) => {
  const tags = extract(description ?? "");
  return [name, ...(ALIASES[name] ?? [])].some((tag) => tags.includes(tag));
};
