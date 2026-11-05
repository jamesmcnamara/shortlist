import { extensionData, mergeExtensionData } from "@/app/lib/extensions/data";
import type { ExtensionHandler } from "@/app/lib/extensions/server";
import { getMovieProvider } from "@/app/lib/movie-metadata";
import { listNominations } from "@/app/lib/queries";
import { badRequest, parseJson, requiredText } from "@/lib/validation";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { theatres } from "@/src/db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { suggestSpecificMovies } from "./suggestions";

const BAD_EXCLUDE = "Send up to 100 movie titles, each up to 200 characters.";

const suggestBody = z.object({
  exclude: z
    .array(requiredText(BAD_EXCLUDE).max(200, BAD_EXCLUDE), BAD_EXCLUDE)
    .max(100, BAD_EXCLUDE)
    .default([]),
});

const suggestedAt = sql`(${extensionData("specific")} ->> 'suggestedAt')::timestamptz`;

/** Asks an LLM for movies that fit the list's description. */
export const specific: ExtensionHandler = {
  access: "admin",
  error: "Unable to get suggestions.",
  handle: async (request, { theatre, userId }) => {
    const parsed = await parseJson(request, suggestBody);
    if (!parsed.success) return badRequest(parsed.error);

    const provider = getMovieProvider();
    if (!provider.hasCredentials()) {
      return Response.json(
        { error: "Movie metadata credentials are not configured." },
        { status: 503 },
      );
    }

    // One atomic write both checks and starts the cooldown, so two requests
    // at once can't both reach the model.
    const [claimed] = await getDb()
      .update(theatres)
      .set({
        extensions: mergeExtensionData(
          "specific",
          sql`jsonb_build_object('suggestedAt', now())`,
        ),
      })
      .where(
        and(
          eq(theatres.id, theatre.id),
          or(
            sql`${suggestedAt} is null`,
            sql`${suggestedAt} < now() - interval '10 seconds'`,
          ),
        ),
      )
      .returning({ id: theatres.id });
    if (!claimed) {
      return Response.json(
        { error: "Give it a few seconds, then try again." },
        { status: 429 },
      );
    }

    const [[requester], nominations] = await Promise.all([
      getDb()
        .select({
          id: authUsers.id,
          name: authUsers.name,
          username: authUsers.username,
        })
        .from(authUsers)
        .where(eq(authUsers.id, userId)),
      listNominations(theatre.id),
    ]);

    try {
      const suggestions = await suggestSpecificMovies({
        provider,
        theatreId: theatre.id,
        requester,
        description: theatre.description ?? "",
        nominations,
        exclude: parsed.data.exclude,
      });
      return Response.json({ suggestions });
    } catch (error) {
      // The error can carry the whole prompt, so only its message is logged.
      console.error(
        "Suggestions failed:",
        error instanceof Error ? error.message : "unknown",
      );
      return Response.json(
        { error: "Couldn't get suggestions right now. Try again." },
        { status: 502 },
      );
    }
  },
};
