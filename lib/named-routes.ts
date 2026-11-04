import { and, eq } from "drizzle-orm";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { theatres } from "@/src/db/schema";
import { HANDLE_PATTERN, userRouteSegment } from "./user-path";

export async function resolveNamedTheatre(user: string, slug: string) {
  const segment = userRouteSegment(user);
  const username = segment.startsWith("@")
    ? segment.slice(1).toLowerCase()
    : "";
  if (
    !HANDLE_PATTERN.test(username) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  )
    return null;
  const [theatre] = await getDb()
    .select({ id: theatres.id })
    .from(theatres)
    .innerJoin(authUsers, eq(authUsers.id, theatres.createdBy))
    .where(and(eq(authUsers.username, username), eq(theatres.slug, slug)))
    .limit(1);
  return theatre ?? null;
}
