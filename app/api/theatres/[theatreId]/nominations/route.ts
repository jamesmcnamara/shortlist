import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getNomination, listNominations } from "@/app/lib/queries";
import {
  withTheatreAdmin,
  withTheatreViewer,
  type TheatreContext,
  type TheatreViewerContext,
} from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import { scheduleNomNotys } from "@/lib/notifications/push";
import { badRequest, dbId, dbIdParam, parseJson } from "@/lib/validation";
import { enrichBoxOffice } from "@/app/lib/enrich-box-office";

export const runtime = "nodejs";

const NOMINATION_ID = "A nomination id is required.";

const comment = z.string("A comment must be text.").trim().nullish();

const createBody = z.object({
  movieId: dbId("A movie id is required."),
  comment: comment.transform((text) => text || null),
});

const updateBody = z
  .object({
    id: dbId(NOMINATION_ID),
    comment,
    completed: z.boolean("Completed must be true or false.").nullish(),
  })
  .refine(
    (body) => body.comment != null || body.completed != null,
    "A comment is required.",
  );

export const GET = withTheatreViewer({ error: "Unable to load nominations" })(
  async (_request: Request, { theatre }: TheatreViewerContext) =>
    Response.json(await listNominations(theatre.id)),
);

export const POST = withTheatreAdmin({ error: "Unable to create nomination." })(
  async (request: Request, { theatre, userId }: TheatreContext) => {
    const parsed = await parseJson(request, createBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { movieId, comment } = parsed.data;

    const db = getDb();

    const [movie] = await db
      .select({ id: movies.id })
      .from(movies)
      .where(eq(movies.id, movieId))
      .limit(1);
    if (!movie) {
      return Response.json(
        { error: "That movie is no longer available." },
        { status: 400 },
      );
    }

    const [inserted] = await db
      .insert(nominations)
      .values({ theatreId: theatre.id, userId, movieId, comment })
      .returning({ id: nominations.id });

    await enrichBoxOffice(movieId);
    const nomination = await getNomination(theatre.id, inserted.id);
    scheduleNomNotys(theatre.id, inserted.id);
    return Response.json(nomination, {
      status: 201,
    });
  },
);

export const PATCH = withTheatreAdmin({
  error: "Unable to update the nomination.",
})(async (request: Request, { theatre, userId }: TheatreContext) => {
  const parsed = await parseJson(request, updateBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { id, comment, completed } = parsed.data;

  const values: Partial<typeof nominations.$inferInsert> = {};
  if (comment != null) values.comment = comment || null;
  if (completed != null) values.completed = completed;

  const ownershipCondition =
    comment != null ? eq(nominations.userId, userId) : undefined;

  const updated = await getDb()
    .update(nominations)
    .set(values)
    .where(
      and(
        eq(nominations.id, id),
        eq(nominations.theatreId, theatre.id),
        ownershipCondition,
      ),
    )
    .returning({ id: nominations.id });

  if (updated.length === 0) {
    return Response.json(
      { error: "That nomination no longer exists." },
      { status: 404 },
    );
  }

  return Response.json(await getNomination(theatre.id, id), { status: 200 });
});

export const DELETE = withTheatreAdmin({
  error: "Unable to delete the nomination.",
})(async (request: Request, { theatre }: TheatreContext) => {
  const parsed = dbIdParam(NOMINATION_ID).safeParse(
    new URL(request.url).searchParams.get("id"),
  );
  if (!parsed.success) return badRequest(parsed.error);
  const id = parsed.data;

  const deleted = await getDb()
    .delete(nominations)
    .where(and(eq(nominations.id, id), eq(nominations.theatreId, theatre.id)))
    .returning({ id: nominations.id });
  if (deleted.length === 0)
    return Response.json(
      { error: "That nomination no longer exists." },
      { status: 404 },
    );
  return new Response(null, { status: 204 });
});
