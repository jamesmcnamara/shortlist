import { notFound, redirect } from "next/navigation";
import { loadRoom } from "@/app/lib/load-room";
import { isUuid, roomPath } from "@/lib/room-path";
import { RoomProvider } from "./RoomContext";

interface RoomLayoutProps {
  children: React.ReactNode;
  params: Promise<{ ownerId: string; slug: string }>;
}

export default async function RoomLayout({
  children,
  params,
}: RoomLayoutProps) {
  const { ownerId, slug } = await params;
  if (!isUuid(ownerId)) notFound();

  const result = await loadRoom(ownerId, slug);
  if (result.status === "unauthenticated") {
    redirect(
      `/auth/sign-in?next=${encodeURIComponent(roomPath({ ownerId, slug }))}`,
    );
  }
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
