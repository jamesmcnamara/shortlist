import { notFound } from "next/navigation";
import { isUuid } from "@/lib/room-path";
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

  return (
    <RoomProvider ownerId={ownerId} slug={slug}>
      {children}
    </RoomProvider>
  );
}
