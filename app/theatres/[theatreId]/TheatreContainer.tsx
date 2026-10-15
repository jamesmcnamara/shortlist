"use client";

import { parseViewState, toSearchParams } from "@/app/lib/view";
import { Theatre } from "@/app/components/Theatre";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useDataSession } from "@/app/lib/data/DataProvider";
import { useTheatreActions } from "@/app/lib/data/useTheatreActions";
import { useTheatre } from "./TheatreContext";

export function TheatreContainer() {
  const { client, noms } = useTheatre();
  const { userId } = useDataSession();
  const api = useTheatreActions(client, noms);
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewContext = useMemo(() => ({ userId }), [userId]);
  const viewState = useMemo(
    () => parseViewState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const setViewState = useCallback(
    (next: typeof viewState) => {
      const query = toSearchParams(next).toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router],
  );

  return (
    <Theatre
      userId={userId}
      viewState={viewState}
      viewContext={viewContext}
      setViewState={setViewState}
      api={api}
      nominees={noms}
    />
  );
}
