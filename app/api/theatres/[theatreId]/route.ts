import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  findInviteCode,
  findShareCode,
  findAdminInviteCode,
  withTheatreAdmin,
  withTheatreMember,
  type TheatreContext,
} from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { theatreMembers, theatres } from "@/src/db/schema";
import { authUsers } from "@/src/db/neon-auth-schema";
import { badRequest, parseJson, requiredText } from "@/lib/validation";

export const runtime = "nodejs";

const updateBody = z.object({ name: requiredText("Nothing to update.") });

export const GET = withTheatreMember({
  error: "Unable to load the theatre.",
})(async (_request: Request, { theatre, role, userId }: TheatreContext) => {
  const members = await getDb()
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: theatreMembers.role,
      joinedAt: theatreMembers.joinedAt,
    })
    .from(theatreMembers)
    .innerJoin(authUsers, eq(authUsers.id, theatreMembers.userId))
    .where(eq(theatreMembers.theatreId, theatre.id));

  return Response.json({
    theatre,
    // The invite code is a capability, so it is fetched only once the caller
    // is known to be an admin rather than filtered out of a wider payload.
    inviteCode: role === "admin" ? await findInviteCode(theatre.id) : undefined,
    adminInviteCode:
      role === "admin" ? await findAdminInviteCode(theatre.id) : undefined,
    // Any member may share a read-only link.
    shareCode: await findShareCode(theatre.id),
    membership: { userId, role },
    members,
  });
});

export const PATCH = withTheatreAdmin({ error: "Unable to update the theatre." })(
  async (request: Request, { theatre }: TheatreContext) => {
    const parsed = await parseJson(request, updateBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { name } = parsed.data;

    const [updated] = await getDb()
      .update(theatres)
      .set({ name })
      .where(eq(theatres.id, theatre.id))
      .returning();

    const {
      inviteCode: _withheldMember,
      adminInviteCode: _withheldAdmin,
      shareCode: _withheldShare,
      ...safe
    } = updated;
    return Response.json(safe);
  },
);

export const DELETE = withTheatreAdmin({ error: "Unable to delete the theatre." })(
  async (_request: Request, { theatre }: TheatreContext) => {
    await getDb().delete(theatres).where(eq(theatres.id, theatre.id));
    return new Response(null, { status: 204 });
  },
);
