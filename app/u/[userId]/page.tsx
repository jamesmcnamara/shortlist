import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { listPublicTheatresWithPosterPreviews } from "@/app/lib/load-theatre";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { requireUserId } from "@/lib/auth/require-user";
import { isUuid } from "@/lib/theatre-path";
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
  if (!isUuid(userId)) notFound();
  const [user] = await getDb()
    .select({ name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);
  if (!user) notFound();
  const viewerUserId = await requireUserId();
  const theatres = await listPublicTheatresWithPosterPreviews(
    userId,
    viewerUserId,
  );
  const initialParams = new URLSearchParams();
  Object.entries(await searchParams).forEach(([key, value]) => {
    (Array.isArray(value) ? value : value === undefined ? [] : [value]).forEach(
      (entry) => initialParams.append(key, entry),
    );
  });

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <ShortlistHeader />
        <h1 className={styles.title}>{user.name}&apos;s Theatres</h1>

        <TheatreDirectory
          theatres={theatres}
          initialSearch={initialParams.toString()}
        />
      </div>
    </main>
  );
}
