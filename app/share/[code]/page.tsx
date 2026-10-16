import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { isShareCode } from "@/lib/theatre-path";
import { PublicTheatreContainer } from "./PublicTheatreContainer";

interface PublicTheatrePageProps {
  params: Promise<{ code: string }>;
}

export default async function PublicTheatrePage({
  params,
}: PublicTheatrePageProps) {
  const { code } = await params;
  if (!isShareCode(code)) notFound();

  return (
    <Suspense fallback={<LoadingOverlay />}>
      <PublicTheatreContainer shareCode={code} />
    </Suspense>
  );
}
