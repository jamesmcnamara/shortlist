import { z } from "zod";
import { isUuid } from "@/lib/theatre-path";

const THEATRE_PREFIX = "/theatres/";
const LEGACY_THEATRE_PREFIX = "/rooms/";

/** Accept old room URLs for notifications created before the rename. */
export const theatreUrl = z.string().refine((path) => {
  const prefix = path.startsWith(THEATRE_PREFIX)
    ? THEATRE_PREFIX
    : path.startsWith(LEGACY_THEATRE_PREFIX)
      ? LEGACY_THEATRE_PREFIX
      : null;
  return prefix !== null && isUuid(path.slice(prefix.length));
});

export const notificationPayload = z.object({
  title: z.string(),
  body: z.string(),
  url: theatreUrl,
  tag: z.string().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayload>;
