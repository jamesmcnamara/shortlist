import { redirect } from "next/navigation";
import Link from "next/link";
import { listRoomsForUser } from "@/app/lib/load-room";
import { requireUserId } from "@/lib/auth/require-user";
import { PRESET_LABELS, type PresetName } from "@/app/lib/rooms";
import styles from "./rooms-landing.module.css";

export const dynamic = "force-dynamic";

/**
 * The root page lists every room the user belongs to. Anyone without one
 * starts by creating it, since a slug they cannot access would 404.
 */
export default async function Home() {
  const userId = await requireUserId();
  if (!userId) redirect("/auth/sign-in");

  const rooms = await listRoomsForUser(userId);
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
                <span className={styles.roomName}>{room.name}</span>
                <span className={styles.roomType}>
                  {PRESET_LABELS[roomTypeOf(room.nominationsPerCycle)]}
                </span>
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
