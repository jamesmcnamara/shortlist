/** A member's notification settings for one list. */
export interface NotificationSettings {
  /** The list's bell. When it's off, the member gets none of the list's notifications. */
  enabled: boolean;
  /** Whether this server can send push notifications at all. */
  configured: boolean;
  /** Notifications when someone else adds a movie. */
  newMovies: boolean;
  /** Whether the member wants each category the list's extensions offer. */
  extensions: Record<string, Record<string, boolean>>;
}

export interface NotificationChanges {
  newMovies?: boolean;
  extensions?: Record<string, Record<string, boolean>>;
}
