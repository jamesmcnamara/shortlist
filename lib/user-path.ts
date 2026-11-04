export const userPath = (username: string | null | undefined): string => {
  if (!username)
    throw new Error("A user handle is required for profile links.");
  return `/u/@${encodeURIComponent(username)}`;
};

export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// Next's route params percent-encode the @ prefix; accept decoded params too.
export const userRouteSegment = (segment: string): string =>
  segment.replace(/^%40/, "@");
