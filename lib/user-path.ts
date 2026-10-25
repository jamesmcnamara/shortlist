export const userPath = (userId: string): string =>
  `/u/${encodeURIComponent(userId)}`;
