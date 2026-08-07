import { requireUserId, unauthorized } from "@/lib/auth/require-user";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    return Response.json(await getDb().select().from(authUsers));
  } catch (error) {
    console.error(error);
    return Response.json({ error: "Unable to load users." }, { status: 500 });
  }
}
