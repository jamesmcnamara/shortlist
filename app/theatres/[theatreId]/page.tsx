import { Suspense } from "react";
import { LoadingOverlay } from "@/app/components/LoadingOverlay";
import { TheatreContainer } from "./TheatreContainer";

export default function TheatrePage() {
  return (
    <Suspense fallback={<LoadingOverlay />}>
      <TheatreContainer />
    </Suspense>
  );
}
