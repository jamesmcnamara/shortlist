import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateInviteCode } from "@/app/lib/theatres";
import { withTheatreAdmin, type TheatreContext } from "@/lib/auth/require-theatre";
import { getDb } from "@/src/db/client";
import { theatres } from "@/src/db/schema";
import { badRequest, parseJson } from "@/lib/validation";

export const runtime = "nodejs";

const rotateBody = z.object({
  kind: z
    .enum(["member", "admin"], "Invite kind must be member or admin.")
    .default("member"),
});

/**
 * Invalidates the old link, which is the only way to un-invite a stranger.
 * `kind` selects which link to rotate; the member link is the default so
 * existing callers keep working unchanged.
 */
export const POST = withTheatreAdmin({
  error: "Unable to rotate the invite link.",
})(async (request: Request, { theatre }: TheatreContext) => {
  const parsed = await parseJson(request, rotateBody);
  if (!parsed.success) return badRequest(parsed.error);
  const { kind } = parsed.data;

  if (kind === "admin") {
    const [updated] = await getDb()
      .update(theatres)
      .set({ adminInviteCode: generateInviteCode() })
      .where(eq(theatres.id, theatre.id))
      .returning({ adminInviteCode: theatres.adminInviteCode });
    return Response.json(updated);
  }

  const [updated] = await getDb()
    .update(theatres)
    .set({ inviteCode: generateInviteCode() })
    .where(eq(theatres.id, theatre.id))
    .returning({ inviteCode: theatres.inviteCode });

  return Response.json(updated);
});
