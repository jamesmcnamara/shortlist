import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTheatreMember } from "@/lib/auth/require-theatre";
import { pushConfiguration } from "@/lib/notifications/push";
import { badRequest, parseJson } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { notifications } from "@/src/db/schema";

export const runtime = "nodejs";

const preferenceBody = z.object({
  enabled: z.boolean("Choose whether to enable notifications."),
});

export const GET = withTheatreMember({
  error: "Unable to load notification settings.",
})(async (_request, { theatre, userId }) => {
  const [preference] = await getDb()
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.theatreId, theatre.id), eq(notifications.userId, userId)),
    );
  return Response.json({
    enabled: Boolean(preference),
    configured: Boolean(pushConfiguration()),
  });
});

export const PUT = withTheatreMember({
  error: "Unable to save notification settings.",
})(async (request, { theatre, userId }) => {
  const parsed = await parseJson(request, preferenceBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { enabled } = parsed.data;
  if (enabled) {
    if (!pushConfiguration())
      return Response.json(
        { error: "Notifications are not configured yet." },
        { status: 503 },
      );
    await getDb()
      .insert(notifications)
      .values({ theatreId: theatre.id, userId })
      .onConflictDoNothing();
  } else {
    await getDb()
      .delete(notifications)
      .where(
        and(
          eq(notifications.theatreId, theatre.id),
          eq(notifications.userId, userId),
        ),
      );
  }
  return Response.json({ enabled, configured: Boolean(pushConfiguration()) });
});
