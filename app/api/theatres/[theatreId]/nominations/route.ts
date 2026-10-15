import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getNomination, listNominations } from "@/app/lib/queries";
import { withTheatreMember, type TheatreContext } from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { movies, nominations } from "@/src/db/schema";
import { scheduleNomNotys } from "@/lib/notifications/push";
import { badRequest, dbId, dbIdParam, parseJson } from "@/lib/validation";

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

export const GET = withTheatreMember({ error: "Unable to load nominations" })(
  async (_request: Request, { theatre }: TheatreContext) =>
    Response.json(await listNominations(theatre.id)),
);

export const POST = withTheatreMember({ error: "Unable to create nomination." })(
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

    const nomination = await getNomination(theatre.id, inserted.id);
    scheduleNomNotys(theatre.id, inserted.id);
    return Response.json(nomination, {
      status: 201,
    });
  },
);

export const PATCH = withTheatreMember({
  error: "Unable to update the nomination.",
})(async (request: Request, { theatre, userId, role }: TheatreContext) => {
  const parsed = await parseJson(request, updateBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { id, comment, completed } = parsed.data;

  // Marking a nomination completed moves it into the theatre's Watched section
  // for everyone, so only an admin may flip that flag. A comment edit is
  // still scoped to the nominator, as before.
  if (completed != null && role !== "admin") {
    return Response.json(
      { error: "Only an admin can mark a movie completed." },
      { status: 403 },
    );
  }

  const values: Partial<typeof nominations.$inferInsert> = {};
  if (comment != null) values.comment = comment || null;
  if (completed != null) values.completed = completed;

  const ownershipCondition =
    completed != null ? undefined : eq(nominations.userId, userId);

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

export const DELETE = withTheatreMember({
  error: "Unable to delete the nomination.",
})(async (request: Request, { theatre, userId, role }: TheatreContext) => {
  const parsed = dbIdParam(NOMINATION_ID).safeParse(
    new URL(request.url).searchParams.get("id"),
  );
  if (!parsed.success) return badRequest(parsed.error);
  const id = parsed.data;

  // Admins can remove any nomination; everyone else can only rescind their own.
  const ownershipCondition =
    role === "admin" ? undefined : eq(nominations.userId, userId);

  const deleted = await getDb()
    .delete(nominations)
    .where(
      and(
        eq(nominations.id, id),
        eq(nominations.theatreId, theatre.id),
        ownershipCondition,
      ),
    )
    .returning({ id: nominations.id });
  if (deleted.length === 0)
    return Response.json(
      { error: "That nomination no longer exists." },
      { status: 404 },
    );
  return new Response(null, { status: 204 });
});
