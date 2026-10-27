import { get, Lens, matching } from "shades";

export type TagPart =
  { type: "text"; value: string } | { type: "tag"; value: string };

export function split(text: string): TagPart[] {
  // Opening punctuation allows tags in prose without matching URL fragments.
  return text
    .split(
      /(?<=^|[\s([{'"\u2018\u201c])(#[\p{L}\p{N}_-][\p{L}\p{M}\p{N}_-]*)/gu,
    )
    .map((value, index): TagPart => ({
      type: index % 2 === 1 ? "tag" : "text",
      value,
    }))
    .filter(({ value }) => !!value);
}

export function extract(description: string): string[] {
  const tags = get(
    matching({ type: "tag" }),
    "value",
    asTag,
  )(split(description));
  return [...new Set(tags)].sort();
}

export const normalize = (value: string) =>
  value.replace(/^#/, "").normalize("NFC").toLowerCase().normalize("NFC");

const asTag: Lens<string, string> = {
  get: normalize,
  mod: (fn) => (value) => `#${fn(normalize(value))}`,
};
