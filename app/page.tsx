import { redirect } from "next/navigation";
import { listRoomsForUser } from "@/app/lib/load-room";
import { requireUserId } from "@/lib/auth/require-user";

export const dynamic = "force-dynamic";

/**
 * There is no content at the root: members land in their most recent room, and
 * anyone without one starts by creating it.
 */
export default async function Home() {
  const userId = await requireUserId();
  if (!userId) redirect("/auth/sign-in");

  const rooms = await listRoomsForUser(userId);
  if (rooms.length > 0) redirect(`/r/${rooms[0].slug}`);

  // Sending someone with no rooms to a slug they cannot access would 404, so
  // they start by making one.
  redirect("/rooms/new");
}
