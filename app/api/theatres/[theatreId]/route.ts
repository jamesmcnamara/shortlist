import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  findInviteCode,
  findAdminInviteCode,
  findTheatreById,
  notFound,
  withTheatreAdmin,
  withTheatreViewer,
  type TheatreContext,
  type TheatreViewerContext,
} from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { theatreMembers, theatres } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import { badRequest, parseJson, requiredText } from "@/lib/validation";
import { listTheatreTags, updateTheatre } from "@/app/lib/theatre-tags";
import { extensionSorts } from "@/app/lib/extensions/view";
import { sortOptions } from "@/app/lib/view";

export const runtime = "nodejs";

const updateBody = z
  .object({
    name: requiredText("A theatre name is required.").optional(),
    description: z.string().trim().optional(),
    defaultSort: z.string().nullable().optional(),
  })
  .refine(
    ({ name, description, defaultSort }) =>
      name !== undefined ||
      description !== undefined ||
      defaultSort !== undefined,
    "Nothing to update.",
  );

export const GET = withTheatreViewer({
  error: "Unable to load the theatre.",
})(async (
  _request: Request,
  { theatre, role, userId }: TheatreViewerContext,
) => {
  const tags = await listTheatreTags(theatre.id);
  if (!userId || !role) {
    return Response.json({ theatre, tags, membership: null });
  }
  const members = await getDb()
    .select({
      id: authUsers.id,
      name: authUsers.name,
      username: authUsers.username,
      email: authUsers.email,
      role: theatreMembers.role,
      joinedAt: theatreMembers.joinedAt,
    })
    .from(theatreMembers)
    .innerJoin(authUsers, eq(authUsers.id, theatreMembers.userId))
    .where(eq(theatreMembers.theatreId, theatre.id));

  return Response.json({
    theatre,
    tags,
    inviteCode: await findInviteCode(theatre.id),
    adminInviteCode:
      role === "admin" ? await findAdminInviteCode(theatre.id) : undefined,
    membership: { userId, role },
    members,
  });
});

export const PATCH = withTheatreAdmin({
  error: "Unable to update the theatre.",
})(async (request: Request, { theatre }: TheatreContext) => {
  const parsed = await parseJson(
    request,
    updateBody.refine(
      ({ defaultSort, description }) =>
        defaultSort === undefined ||
        defaultSort === null ||
        sortOptions(extensionSorts(description ?? theatre.description)).some(
          ({ id }) => id === defaultSort,
        ),
      "Choose an available sort.",
    ),
  );
  if (!parsed.success) return badRequest(parsed.error);
  await updateTheatre(theatre.id, parsed.data);
  const updated = await findTheatreById(theatre.id);
  return updated ? Response.json(updated) : notFound();
});

export const DELETE = withTheatreAdmin({
  error: "Unable to delete the theatre.",
})(async (_request: Request, { theatre }: TheatreContext) => {
  await getDb().delete(theatres).where(eq(theatres.id, theatre.id));
  return new Response(null, { status: 204 });
});
