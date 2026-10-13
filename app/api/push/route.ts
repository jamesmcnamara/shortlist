import { and, eq } from "drizzle-orm";
import { withUser } from "@/lib/auth/require-user";
import { z } from "zod";
import { pushConfiguration, pushSubscription } from "@/lib/notifications/push";
import { badRequest, parseJson } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { subscriptions } from "@/src/db/schema";

export const runtime = "nodejs";

const disconnectBody = z.object({
  endpoint: z.string("A push endpoint is required."),
});

export const POST = withUser({
  error: "Unable to enable notifications on this device.",
})(async (request, userId) => {
  if (!pushConfiguration())
    return Response.json(
      { error: "Notifications are not configured yet." },
      { status: 503 },
    );
  const parsed = await parseJson(request, pushSubscription);
  if (!parsed.success) return badRequest(parsed.error);
  const subscription = parsed.data;
  const saved = await getDb()
    .insert(subscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      ...subscription.keys,
    })
    .onConflictDoUpdate({
      target: subscriptions.endpoint,
      set: subscription.keys,
      setWhere: eq(subscriptions.userId, userId),
    })
    .returning({ endpoint: subscriptions.endpoint });
  if (!saved.length)
    return Response.json(
      {
        error:
          "This browser is registered to another account. Sign out of that account first, or reset this site's notification permission.",
      },
      { status: 409 },
    );
  return new Response(null, { status: 204 });
});

export const DELETE = withUser({
  error: "Unable to disconnect notifications on this device.",
})(async (request, userId) => {
  const parsed = await parseJson(request, disconnectBody);
  if (!parsed.success) return badRequest(parsed.error);
  await getDb()
    .delete(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.endpoint, parsed.data.endpoint),
      ),
    );
  return new Response(null, { status: 204 });
});
