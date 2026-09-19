import { redirect } from "next/navigation";
import { MovieSearch } from "@/app/components/MovieSearch";
import { listRoomsForUser } from "@/app/lib/load-room";
import { requireUserId } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * Search is the landing surface: finding something to watch is the thing
 * people open the app to do. Rooms live at /rooms.
 */
export default async function Home() {
  const userId = await requireUserId();
  if (!userId) redirect("/auth/sign-in");

  // Without a room there is nowhere to add a movie, so onboarding comes first.
  const rooms = await listRoomsForUser(userId);
  if (rooms.length === 0) redirect("/rooms/new");

  return <MovieSearch />;
}
