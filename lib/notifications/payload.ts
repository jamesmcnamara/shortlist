import { z } from "zod";
import { isUuid } from "@/lib/room-path";

const ROOM_PREFIX = "/rooms/";

/** Only a room link may be opened from a notification. */
export const roomUrl = z
  .string()
  .refine(
    (path) => path.startsWith(ROOM_PREFIX) && isUuid(path.slice(ROOM_PREFIX.length)),
  );

export const notificationPayload = z.object({
  title: z.string(),
  body: z.string(),
  url: roomUrl,
  tag: z.string().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayload>;
