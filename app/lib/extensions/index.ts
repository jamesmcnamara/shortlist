import { extract } from "@/app/lib/tags";

/** Opt-in list behaviors. Each is turned on by the hashtag with its name. */
export const EXTENSIONS = ["specific"] as const;

export type ExtensionName = (typeof EXTENSIONS)[number];

export const isExtension = (name: string): name is ExtensionName =>
  (EXTENSIONS as readonly string[]).includes(name);

export const hasExtension = (
  name: ExtensionName,
  description?: string | null,
) => extract(description ?? "").includes(name);
