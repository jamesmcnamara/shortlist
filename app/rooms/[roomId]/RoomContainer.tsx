"use client";

import { parseViewState, toSearchParams } from "@/app/lib/view";
import { Room } from "@/app/components/Room";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useDataSession } from "@/app/lib/data/DataProvider";
import { useRoomActions } from "@/app/lib/data/useRoomActions";
import { useRoom } from "./RoomContext";

export function RoomContainer() {
  const { client, noms } = useRoom();
  const { userId } = useDataSession();
  const api = useRoomActions(client, noms);
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
    <Room
      userId={userId}
      viewState={viewState}
      viewContext={viewContext}
      setViewState={setViewState}
      api={api}
      nominees={noms}
    />
  );
}
