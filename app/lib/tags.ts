export function extractTags(description: string): string[] {
  // Opening punctuation allows tags in prose without matching URL fragments.
  const matches = description.matchAll(
    /(?:^|[\s([{'"\u2018\u201c])#([\p{L}\p{N}_-][\p{L}\p{M}\p{N}_-]*)/gu,
  );
  return [
    ...new Set(
      Array.from(matches, ([, tag]) =>
        tag.normalize("NFC").toLowerCase().normalize("NFC"),
      ),
    ),
  ].sort();
}
