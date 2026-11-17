import { ECDH } from "node:crypto";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
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
} from "@/src/db/schema";
import type { ExtensionName } from "@/app/lib/extensions";
import { extensionData } from "@/app/lib/extensions/data";
import { findTheatreById, type SafeTheatre } from "@/lib/auth/require-theatre";
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

/** Which members get a notification, beyond having the list's bell on. */
export interface Audience {
  /** The kind of notification, which members can turn off in Settings. */
  wants: "newMovies" | { extension: ExtensionName; category: string };
  /** Only these members. */
  only?: string[];
  /** Everyone but these members. */
  except?: string[];
}

export interface Notice {
  body: string;
  tag: string;
}

// A missing extension preference counts as on.
const wanting = (wants: Audience["wants"]) =>
  wants === "newMovies"
    ? eq(notifications.newMovies, true)
    : sql`${extensionData(wants.extension, notifications.extensions)} -> ${wants.category}::text is distinct from 'false'::jsonb`;

/** Pushes a notice about a list to each of the audience's devices. */
export async function notifyMembers(
  theatre: Pick<SafeTheatre, "id" | "name" | "path">,
  { wants, only, except }: Audience,
  { body, tag }: Notice,
) {
  const config = pushConfiguration();
  if (!config || only?.length === 0) return;
  const db = getDb();
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
        eq(notifications.theatreId, theatre.id),
        wanting(wants),
        only ? inArray(subscriptions.userId, only) : undefined,
        except?.length ? notInArray(subscriptions.userId, except) : undefined,
      ),
    );
  const payload = JSON.stringify({
    title: theatre.name.slice(0, 100),
    body,
    url: theatre.path,
    tag,
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

/** Sends notifications after the response, so push services never slow a request down. */
export function scheduleNotification(send: () => Promise<void>) {
  if (!pushConfiguration()) return;
  after(async () => {
    try {
      await send();
    } catch {
      console.error("Unable to prepare movie notifications");
    }
  });
}

export async function sendNomNotys(theatreId: string, nominationId: number) {
  if (!pushConfiguration()) return;
  const [nomination] = await getDb()
    .select({ userId: nominations.userId, title: movies.details })
    .from(nominations)
    .innerJoin(movies, eq(movies.id, nominations.movieId))
    .where(
      and(
        eq(nominations.theatreId, theatreId),
        eq(nominations.id, nominationId),
      ),
    );
  if (!nomination) return;
  const theatre = await findTheatreById(theatreId);
  if (!theatre) return;
  const title = titled.safeParse(nomination.title).data?.title ?? "A movie";
  await notifyMembers(
    theatre,
    { wants: "newMovies", except: [nomination.userId] },
    {
      body: `${title.slice(0, 200)} was added to the list.`,
      tag: `nomination-${nominationId}`,
    },
  );
}

export const scheduleNomNotys = (theatreId: string, nominationId: number) =>
  scheduleNotification(() => sendNomNotys(theatreId, nominationId));
