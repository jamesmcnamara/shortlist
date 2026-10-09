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
