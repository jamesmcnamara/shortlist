const MAX_SLUG_LENGTH = 60;

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

export const isValidSlug = (slug: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= MAX_SLUG_LENGTH;

const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ambiguous characters are excluded so codes survive being read aloud. */
export const generateInviteCode = (length = 10): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length],
  ).join("");
};
