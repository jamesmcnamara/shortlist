import type { ExtensionName, NotificationCategory } from "@/app/lib/extensions";
import { movieClubNotifications, movieClubSorts } from "./movieclub/view";

export const extensionSorts = (description?: string | null) =>
  movieClubSorts(description);

/** The notifications each of the list's extensions can send. */
export const extensionNotifications = (
  description?: string | null,
): Partial<Record<ExtensionName, NotificationCategory[]>> => ({
  ...movieClubNotifications(description),
});
