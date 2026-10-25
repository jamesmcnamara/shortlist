import { listNominations } from "@/app/lib/queries";
import {
  findTheatreByInviteCode,
  withPublicTheatre,
} from "@/lib/auth/require-theatre";
import { theatrePath } from "@/lib/theatre-path";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { theatreMembers } from "@/src/db/schema";

export const runtime = "nodejs";

export const GET = withPublicTheatre({
  error: "Unable to load the theatre.",
})(async (_, { theatre }) =>
  Response.json({
    theatre: { name: theatre.name, description: theatre.description },
    nominations: await listNominations(theatre.id),
  }),
);

/**
 * Anyone holding a valid invite code may join. The member link grants
 * "member"; the admin link grants "admin" — including upgrading someone who
 * is already a member, since sharing the admin link is an explicit decision
 * to hand out that role.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const { code } = await context.params;
    const db = getDb();

    const resolved = await findTheatreByInviteCode(code);

    if (!resolved) {
      return Response.json(
        { error: "That invite link is no longer valid." },
        { status: 404 },
      );
    }

    const { theatre, role } = resolved;

    // Re-joining is a no-op rather than an error, so a shared link keeps
    // working for people who already accepted it. The admin link can upgrade
    // an existing member, but the member link must never downgrade an admin.
    if (role === "admin") {
      await db
        .insert(theatreMembers)
        .values({ theatreId: theatre.id, userId, role })
        .onConflictDoUpdate({
          target: [theatreMembers.theatreId, theatreMembers.userId],
          set: { role },
        });
    } else {
      await db
        .insert(theatreMembers)
        .values({ theatreId: theatre.id, userId, role })
        .onConflictDoNothing({
          target: [theatreMembers.theatreId, theatreMembers.userId],
        });
    }

    return Response.json({
      name: theatre.name,
      path: theatrePath(theatre),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to join that theatre." },
      { status: 500 },
    );
  }
}
