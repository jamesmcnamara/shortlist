import { and, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { ExtensionName } from "@/app/lib/extensions";
import { mergeExtensionData } from "@/app/lib/extensions/data";
import { extensionNotifications } from "@/app/lib/extensions/view";
import {
  withTheatreMember,
  type SafeTheatre,
} from "@/lib/auth/require-theatre";
import { pushConfiguration } from "@/lib/notifications/push";
import type { NotificationSettings } from "@/lib/notifications/settings";
import { badRequest, parseJson } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { notifications } from "@/src/db/schema";

export const runtime = "nodejs";

const preferenceBody = z.object({
  enabled: z.boolean("Choose whether to enable notifications."),
});

const CHOICE = "Choose whether to get this notification.";

/** Only the categories this list offers can be changed. */
const changesBody = (theatre: SafeTheatre) =>
  z.strictObject({
    newMovies: z.boolean(CHOICE).optional(),
    extensions: z
      .strictObject(
        Object.fromEntries(
          Object.entries(extensionNotifications(theatre.description)).map(
            ([name, categories]) => [
              name,
              z
                .strictObject(
                  Object.fromEntries(
                    categories.map(({ id }) => [
                      id,
                      z.boolean(CHOICE).optional(),
                    ]),
                  ),
                )
                .optional(),
            ],
          ),
        ),
      )
      .optional(),
  });

const mine = (theatre: SafeTheatre, userId: string) =>
  and(
    eq(notifications.theatreId, theatre.id),
    eq(notifications.userId, userId),
  );

async function loadSettings(
  theatre: SafeTheatre,
  userId: string,
): Promise<NotificationSettings> {
  const [preference] = await getDb()
    .select({
      newMovies: notifications.newMovies,
      extensions: notifications.extensions,
    })
    .from(notifications)
    .where(mine(theatre, userId));
  const offered = Object.entries(extensionNotifications(theatre.description));
  return {
    enabled: Boolean(preference),
    configured: Boolean(pushConfiguration()),
    newMovies: preference?.newMovies ?? true,
    // Categories are on until the member turns them off.
    extensions: Object.fromEntries(
      offered.map(([name, categories]) => {
        const saved = preference?.extensions[name] as
          Record<string, unknown> | null | undefined;
        return [
          name,
          Object.fromEntries(
            categories.map(({ id }) => [id, saved?.[id] !== false]),
          ),
        ];
      }),
    ),
  };
}

export const GET = withTheatreMember({
  error: "Unable to load notification settings.",
})(async (_request, { theatre, userId }) =>
  Response.json(await loadSettings(theatre, userId)),
);

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
    await getDb().delete(notifications).where(mine(theatre, userId));
  }
  return Response.json(await loadSettings(theatre, userId));
});

/** Turns categories of the list's notifications on or off. */
export const PATCH = withTheatreMember({
  error: "Unable to save notification settings.",
})(async (request, { theatre, userId }) => {
  const parsed = await parseJson(request, changesBody(theatre));
  if (!parsed.success) return badRequest(parsed.error);
  const { newMovies } = parsed.data;
  const extensions = Object.entries(parsed.data.extensions ?? {}).filter(
    ([, choices]) => choices && Object.keys(choices).length,
  );
  if (newMovies === undefined && !extensions.length) {
    return Response.json(
      { error: "Choose a notification to change." },
      { status: 400 },
    );
  }

  const updated = await getDb()
    .update(notifications)
    .set({
      ...(newMovies === undefined ? {} : { newMovies }),
      ...(extensions.length
        ? {
            extensions: extensions.reduce<SQL>(
              (column, [name, choices]) =>
                mergeExtensionData(
                  name as ExtensionName,
                  sql`${JSON.stringify(choices)}::jsonb`,
                  column,
                ),
              sql`${notifications.extensions}`,
            ),
          }
        : {}),
    })
    .where(mine(theatre, userId))
    .returning({ userId: notifications.userId });
  if (!updated.length) {
    return Response.json(
      { error: "Turn on notifications for this list first." },
      { status: 409 },
    );
  }
  return Response.json(await loadSettings(theatre, userId));
});
