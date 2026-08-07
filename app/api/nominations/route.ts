import { and, desc, eq, gte, lt } from "drizzle-orm";
import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import {getMonth} from "@/app/lib/date-utils";
import { getDb } from "@/src/db/client";
import { nominations } from "@/src/db/schema";

export const runtime = "nodejs";


export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    return Response.json(await getDb().select().from(nominations).orderBy(desc(nominations.createdAt)));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to load nominations." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const body = await request.json().catch(() => null);
    const movieId = Number(body?.movieId);
    if (!Number.isInteger(movieId)) {
      return Response.json({ error: "A movie id is required." }, { status: 400 });
    }

    const month = getMonth();
    const db = getDb();
    const existing = await db.select().from(nominations)
      .where(and(eq(nominations.userId, userId), eq(nominations.month, month)))
      .limit(1);
    if (existing.length > 0) return Response.json({ error: "You can nominate one movie per month." }, { status: 409 });

    const [nomination] = await db.insert(nominations).values({
      userId,
      month,
      movieId,
      comment: typeof body?.comment === "string" ? body.comment : null
    }).returning();
    return Response.json(nomination, { status: 201 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to create the nomination." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id)) {
      return Response.json({ error: "A nomination id is required." }, { status: 400 });
    }

    const deleted = await getDb().delete(nominations)
      .where(and(eq(nominations.id, id), eq(nominations.userId, userId)))
      .returning({ id: nominations.id });
    if (deleted.length === 0) return Response.json({ error: "That nomination no longer exists." }, { status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to delete the nomination." }, { status: 500 });
  }
}
