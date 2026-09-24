import { redirect } from "next/navigation";
import Link from "next/link";
import { listRoomsWithPosterPreviewsForUser } from "@/app/lib/load-room";
import { requireUserId } from "@/lib/auth/require-user";
import { PRESET_LABELS, type PresetName } from "@/app/lib/rooms";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

/**
 * Lists every room the user belongs to. Anyone without one starts by
 * creating it, since a slug they cannot access would 404.
 */
export default async function Rooms() {
  const userId = await requireUserId();
  if (!userId) redirect("/auth/sign-in");

  const rooms = await listRoomsWithPosterPreviewsForUser(userId);
  if (rooms.length === 0) redirect("/rooms/new");
  if (rooms.length === 1) redirect(`/r/${rooms[0].slug}`);

  return (
    <main className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Your rooms</h1>
          <Link className={styles.newRoom} href="/rooms/new">
            New room
          </Link>
        </div>

        <ul className={styles.list}>
          {rooms.map((room) => (
            <li key={room.id}>
              <Link className={styles.roomCard} href={`/r/${room.slug}`}>
                <span className={styles.roomDetails}>
                  <span className={styles.roomName}>{room.name}</span>
                </span>
                {room.posterUrls.length > 0 ? (
                  <span className={styles.posters} aria-hidden="true">
                    {room.posterUrls.map((posterUrl) => (
                      <img
                        className={styles.poster}
                        key={posterUrl}
                        src={posterUrl}
                        alt=""
                        width="48"
                        height="72"
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

/** Mirrors app/lib/rooms.ts#getRoomType, but for the slimmer RoomSummary shape. */
function roomTypeOf(nominationsPerCycle: number | null): PresetName {
  return nominationsPerCycle ? "club" : "watchlist";
}
