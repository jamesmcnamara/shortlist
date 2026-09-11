import { notFound, redirect } from "next/navigation";
import { loadRoom } from "@/app/lib/load-room";
import { RoomProvider } from "./RoomContext";

interface RoomLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function RoomLayout({
  children,
  params,
}: RoomLayoutProps) {
  const { slug } = await params;
  const result = await loadRoom(slug);

  if (result.status === "unauthenticated") {
    redirect(`/auth/sign-in?next=${encodeURIComponent(`/r/${slug}`)}`);
  }
  // Non-members see the same 404 as a room that does not exist, so slugs
  // cannot be probed.
  if (result.status === "not-a-member") notFound();

  const { room, role, currentCycle, rooms } = result.data;

  return (
    <RoomProvider
      room={room}
      role={role}
      currentCycle={currentCycle}
      rooms={rooms}
    >
      {children}
    </RoomProvider>
  );
}
