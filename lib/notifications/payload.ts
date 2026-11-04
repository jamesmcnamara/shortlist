import { z } from "zod";
import { HANDLE_PATTERN } from "@/lib/user-path";

export const theatreUrl = z.string().refine((path) => {
  const named = /^\/u\/@([^/]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
  return named !== null && HANDLE_PATTERN.test(named[1]);
});

export const notificationPayload = z.object({
  title: z.string(),
  body: z.string(),
  url: theatreUrl,
  tag: z.string().optional(),
});

export type NotificationPayload = z.infer<typeof notificationPayload>;
