const DEFAULT_REDIRECT = "/";

export function getSafeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_REDIRECT;
  }

  return value;
}
