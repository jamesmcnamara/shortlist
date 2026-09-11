"use server";

import { listNominationsBySlug } from "@/app/lib/queries";
import { Suspense } from "react";
import { RoomContainer } from "./RoomContainer";

interface RoomPageProps {
  params: Promise<{ slug: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug } = await params;
  const nominations = await listNominationsBySlug(slug);
  return (
    <Suspense fallback={null}>
      <RoomContainer noms={nominations} />
    </Suspense>
  );
}
