import { withUser } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { nominations, nomcoms } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { getFullNominationForId } from "../nominations/route";

export const runtime = "nodejs";

export const POST = withUser({ error: "Unable to add your comment." })(async (
  request: Request,
  userId: string,
) => {
  const body = await request.json().catch(() => null);
  const nominationId = Number(body?.nominationId);
  const comment = typeof body?.comment === "string" ? body.comment.trim() : "";

  if (!Number.isInteger(nominationId)) {
    return Response.json(
      { error: "A nomination id is required." },
      { status: 400 },
    );
  }

  if (!comment) {
    return Response.json({ error: "A comment is required." }, { status: 400 });
  }

  const db = getDb();
  const [nomination] = await db
    .select({ id: nominations.id })
    .from(nominations)
    .where(eq(nominations.id, nominationId))
    .limit(1);

  if (!nomination) {
    return Response.json(
      { error: "That nomination no longer exists." },
      { status: 404 },
    );
  }

  await db.insert(nomcoms).values({ userId, nominationId, comment });
  return Response.json(await getFullNominationForId(nominationId), {
    status: 201,
  });
});
