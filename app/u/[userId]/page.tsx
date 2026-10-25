import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { listPublicTheatresWithPosterPreviews } from "@/app/lib/load-theatre";
import { getDb } from "@/src/db/client";
import { authUsers } from "@/src/db/neon-auth-schema";
import { requireUserId } from "@/lib/auth/require-user";
import { isUuid, theatrePath } from "@/lib/theatre-path";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ShortlistHeader } from "@/app/components/ShortlistHeader";
import styles from "./page.module.css";

export default async function UserTheatres({
  params,
}: {
  params: Promise<{ userId: string }>;
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

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <ShortlistHeader />
        <h1 className={styles.title}>{user.name}&apos;s Theatres</h1>

        <ul className={styles.list}>
          {theatres.length === 0 && (
            <li>
              <p>No theatres yet.</p>
            </li>
          )}
          {theatres.map((theatre) => (
            <li key={theatre.id}>
              <Link
                className={styles.theatreCard}
                href={theatrePath(theatre)}
                prefetch
              >
                <span className={styles.theatreName}>{theatre.name}</span>
                {theatre.posterUrls.length > 0 ? (
                  <span className={styles.posters} aria-hidden="true">
                    {theatre.posterUrls.map((posterUrl, i) => (
                      <img
                        className={styles.poster}
                        key={posterUrl}
                        style={{ "--i": i } as CSSProperties}
                        src={posterUrl}
                        alt=""
                        width="72"
                        height="108"
                        loading="lazy"
                      />
                    ))}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
