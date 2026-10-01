import { Suspense } from "react";
import { listNominationsByPath } from "@/app/lib/queries";
import { RoomContainer } from "./RoomContainer";

interface RoomPageProps {
  params: Promise<{ ownerId: string; slug: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { ownerId, slug } = await params;
  const nominations = await listNominationsByPath(ownerId, slug);
  return <RoomContainer noms={nominations} />;
}
