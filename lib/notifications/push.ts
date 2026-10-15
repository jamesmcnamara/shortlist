import { ECDH } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import webpush from "web-push";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/db/client";
import {
  movies,
  nominations,
  notifications,
  subscriptions,
  theatreMembers,
  theatres,
} from "@/src/db/schema";
import { theatrePath } from "@/lib/theatre-path";
import type { NotificationPayload } from "./payload";

interface PushConfiguration {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function pushConfiguration(): PushConfiguration | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject
    ? { publicKey, privateKey, subject }
    : null;
}

export function validPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      endpoint.length <= 2048 &&
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.pathname !== "/" &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname.endsWith(".push.apple.com"))
    );
  } catch {
    return false;
  }
}

const isP256Point = (key: string) => {
  try {
    ECDH.convertKey(Buffer.from(key, "base64url"), "prime256v1");
    return true;
  } catch {
    return false;
  }
};

const INVALID_SUBSCRIPTION = "Invalid push subscription.";

const base64url = (length: number) =>
  z
    .string(INVALID_SUBSCRIPTION)
    .regex(new RegExp(`^[A-Za-z0-9_-]{${length}}$`), INVALID_SUBSCRIPTION);

export const pushSubscription = z.object(
  {
    endpoint: z
      .string(INVALID_SUBSCRIPTION)
      .refine(validPushEndpoint, INVALID_SUBSCRIPTION),
    keys: z.object(
      {
        p256dh: base64url(87).refine(isP256Point, INVALID_SUBSCRIPTION),
        auth: base64url(22),
      },
      INVALID_SUBSCRIPTION,
    ),
  },
  INVALID_SUBSCRIPTION,
) satisfies z.ZodType<webpush.PushSubscription>;

const titled = z.object({ title: z.string() });

export async function sendNomNotys(theatreId: string, nominationId: number) {
  const config = pushConfiguration();
  if (!config) return;
  const db = getDb();
  const [nomination] = await db
    .select({
      userId: nominations.userId,
      title: movies.details,
      theatreName: theatres.name,
    })
    .from(nominations)
    .innerJoin(movies, eq(movies.id, nominations.movieId))
    .innerJoin(theatres, eq(theatres.id, nominations.theatreId))
    .where(
      and(eq(nominations.theatreId, theatreId), eq(nominations.id, nominationId)),
    );
  if (!nomination) return;
  const title = titled.safeParse(nomination.title).data?.title ?? "A movie";
  const recipients = await db
    .select({
      endpoint: subscriptions.endpoint,
      p256dh: subscriptions.p256dh,
      auth: subscriptions.auth,
      userId: subscriptions.userId,
    })
    .from(subscriptions)
    .innerJoin(notifications, eq(notifications.userId, subscriptions.userId))
    .innerJoin(
      theatreMembers,
      and(
        eq(theatreMembers.theatreId, notifications.theatreId),
        eq(theatreMembers.userId, notifications.userId),
      ),
    )
    .where(
      and(
        eq(notifications.theatreId, theatreId),
        ne(subscriptions.userId, nomination.userId),
      ),
    );
  const payload = JSON.stringify({
    title: nomination.theatreName.slice(0, 100),
    body: `${title.slice(0, 200)} was added to the list.`,
    url: theatrePath({ id: theatreId }),
    tag: `nomination-${nominationId}`,
  } satisfies NotificationPayload);
  await Promise.all(
    recipients.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { vapidDetails: config, timeout: 5000, TTL: 3600 },
        );
      } catch (error) {
        if (
          error instanceof webpush.WebPushError &&
          [404, 410].includes(error.statusCode)
        ) {
          await db
            .delete(subscriptions)
            .where(
              and(
                eq(subscriptions.endpoint, subscription.endpoint),
                eq(subscriptions.userId, subscription.userId),
              ),
            );
        } else {
          // Push errors include secret endpoints and response bodies; log only status.
          console.error("Movie notification delivery failed", {
            status:
              error instanceof webpush.WebPushError
                ? error.statusCode
                : "unknown",
          });
        }
      }
    }),
  );
}

export function scheduleNomNotys(theatreId: string, nominationId: number) {
  if (!pushConfiguration()) return;
  after(async () => {
    try {
      await sendNomNotys(theatreId, nominationId);
    } catch {
      console.error("Unable to prepare movie notifications");
    }
  });
}
