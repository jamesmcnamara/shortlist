// Better Auth requires an email even for handle-only accounts.
const PLACEHOLDER_EMAIL_DOMAIN = "accounts.shortlist.invalid";

export const createPlaceholderEmail = () =>
  `${crypto.randomUUID()}@${PLACEHOLDER_EMAIL_DOMAIN}`;

export const isPlaceholderEmail = (email: string) =>
  email.endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
