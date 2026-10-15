import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTheatreAdmin, type TheatreContext } from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { theatreMembers } from "@/src/db/schema";
import { badRequest, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

const roleBody = z.object({
  role: z.enum(["admin", "member"], "Role must be admin or member."),
});

/**
 * Removing a member deliberately leaves their movies in place —
 * otherwise a departure would silently gut the list.
 */
export const DELETE = withTheatreAdmin({ error: "Unable to remove that member." })(
  async (_request: Request, { theatre, params, userId }: TheatreContext) => {
    const targetId = params.userId;
    if (!targetId) {
      return Response.json(
        { error: "A user id is required." },
        { status: 400 },
      );
    }

    if (targetId === userId) {
      return Response.json(
        { error: "You cannot remove yourself from a theatre you administer." },
        { status: 409 },
      );
    }

    // The caller is necessarily an admin other than the target, so the theatre
    // keeps at least one admin without a further check.
    const removed = await getDb()
      .delete(theatreMembers)
      .where(
        and(eq(theatreMembers.theatreId, theatre.id), eq(theatreMembers.userId, targetId)),
      )
      .returning({ userId: theatreMembers.userId });

    if (removed.length === 0) {
      return Response.json(
        { error: "That person is not a member of this theatre." },
        { status: 404 },
      );
    }

    return new Response(null, { status: 204 });
  },
);

/** Promote or demote. */
export const PATCH = withTheatreAdmin({ error: "Unable to update that member." })(
  async (request: Request, { theatre, params, userId }: TheatreContext) => {
    const targetId = params.userId;
    const parsed = await parseJson(request, roleBody);
    if (!parsed.success) return badRequest(parsed.error);
    const { role } = parsed.data;

    if (targetId === userId && role === "member") {
      return Response.json(
        { error: "You cannot demote yourself." },
        { status: 409 },
      );
    }

    const [updated] = await getDb()
      .update(theatreMembers)
      .set({ role })
      .where(
        and(eq(theatreMembers.theatreId, theatre.id), eq(theatreMembers.userId, targetId)),
      )
      .returning();

    if (!updated) {
      return Response.json(
        { error: "That person is not a member of this theatre." },
        { status: 404 },
      );
    }

    return Response.json(updated);
  },
);
