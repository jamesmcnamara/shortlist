import { z } from "zod";
import { HANDLE_PATTERN } from "@/lib/user-path";
import { dbId } from "@/lib/validation";

export const theatreUrl = z.string().refine((path) => {
  const named = /^\/u\/@([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  return named !== null && HANDLE_PATTERN.test(named[1]);
});

export const notificationDestination = z.object({
  // Older service workers reject URLs with query strings.
  url: theatreUrl,
  nominationId: dbId("Invalid nomination ID.").optional(),
});

export const notificationPayload = notificationDestination.extend({
  title: z.string(),
  body: z.string(),
  tag: z.string().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayload>;
