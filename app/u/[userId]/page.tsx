import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { listPublicTheatresWithPosterPreviews } from "@/app/lib/load-theatre";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { requireUserId } from "@/lib/auth/require-user";
import { HANDLE_PATTERN, userPath, userRouteSegment } from "@/lib/user-path";
import { toQueryString } from "@/lib/search-params";
import { resolveUsernameRedirect } from "@/lib/named-routes";
import { TheatreDirectory } from "./TheatreDirectory";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import styles from "./page.module.css";

export default async function UserTheatres({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ userId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await params;
  const segment = userRouteSegment(userId);
  if (!segment.startsWith("@")) notFound();
  const username = segment.slice(1).toLowerCase();
  if (!HANDLE_PATTERN.test(username)) notFound();
  const [user] = await getDb()
    .select({
      id: authUsers.id,
      name: authUsers.name,
      username: authUsers.username,
    })
    .from(authUsers)
    .where(eq(authUsers.username, username))
    .limit(1);
  const initialSearch = toQueryString(await searchParams);
  if (!user) {
    const target = await resolveUsernameRedirect(segment);
    if (!target) notFound();
    redirect(`${userPath(target)}${initialSearch ? `?${initialSearch}` : ""}`);
  }
  if (segment !== `@${user.username}`) {
    redirect(
      `${userPath(user.username)}${initialSearch ? `?${initialSearch}` : ""}`,
    );
  }
  const viewerUserId = await requireUserId();
  const theatres = await listPublicTheatresWithPosterPreviews(
    user.id,
    viewerUserId,
  );

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <ShortlistHeader />
        <h1 className={styles.title}>{user.name}&apos;s Theatres</h1>

        <TheatreDirectory theatres={theatres} initialSearch={initialSearch} />
      </div>
    </main>
  );
}
