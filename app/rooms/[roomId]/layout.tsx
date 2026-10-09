import { notFound } from "next/navigation";
import { isUuid } from "@/lib/room-path";
import { RoomProvider } from "./RoomContext";

interface RoomLayoutProps {
  children: React.ReactNode;
  params: Promise<{ roomId: string }>;
}

export default async function RoomLayout({
  children,
  params,
}: RoomLayoutProps) {
  const { roomId } = await params;
  if (!isUuid(roomId)) notFound();

  return (
    <RoomProvider roomId={roomId}>
      {children}
    </RoomProvider>
  );
}
