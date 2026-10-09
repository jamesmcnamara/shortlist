import { Suspense } from "react";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { RoomContainer } from "./RoomContainer";

export default function RoomPage() {
  return (
    <Suspense fallback={<LoadingOverlay />}>
      <RoomContainer />
    </Suspense>
  );
}
