import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { nominations, nomcoms } from "@/src/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST (request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const body = await request.json().catch(() => null);
  const nominationId = Number(body?.nominationId);
  const comment =
    typeof body?.comment === "string" ? body.comment.trim() : "";

  if (!Number.isInteger(nominationId)) {
    return Response.json(
      { error: "A nomination id is required." },
      { status: 400 },
    );
  }

  if (!comment) {
    return Response.json(
      { error: "A comment is required." },
      { status: 400 },
    );
  }

  try {
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

    const updatedNomination = await db.query.nominations.findFirst({
      where: (nominations, { eq }) => eq(nominations.id, nominationId),
      with: {
        movie: true,
        votes: {
          with: { voter: true },
        },
        nomcoms: {
          with: { commenter: true },
          orderBy: (nomcoms, { asc }) => asc(nomcoms.createdAt),
        },
        nominator: true,
      },
    });

    return Response.json(updatedNomination, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Unable to add your comment." },
      { status: 500 },
    );
  }
}
