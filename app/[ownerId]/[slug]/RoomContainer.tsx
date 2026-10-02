"use client";

import { parseViewState, toSearchParams } from "@/app/lib/view";
import { authClient } from "@/lib/auth/client";
import { Room, type RoomAPI } from "@/app/components/Room";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useRoom } from "./RoomContext";
import { Nomination } from "@/src/db/schema";

export interface RoomContainerProps {
  noms: Nomination[];
}

export function RoomContainer({ noms }: RoomContainerProps) {
  const { client } = useRoom();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nominations, setNominations] = useState(mapify(noms));

  const userId = session?.user?.id;

  const all = useMemo(() => Array.from(nominations.values()), [nominations]);

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

  const api: RoomAPI = {
    nominate: async (candidate, comment) => {
      const data = await client.nominations.create({
        movieId: candidate.id,
        comment,
      });
      setNominations((prev) => new Map(prev).set(data.id, data));
    },
    rescind: async (nominationId) => {
      await client.nominations.delete(nominationId);
      setNominations((prev) => {
        const next = new Map(prev);
        next.delete(nominationId);
        return next;
      });
    },
    addNomCom: async (nominationId, comment) => {
      const data = await client.nomcoms.create(nominationId, comment);
      setNominations((prev) => new Map(prev).set(data.id, data));
    },
    updateNomRec: async (nominationId, comment) => {
      const data = await client.nominations.updateComment(
        nominationId,
        comment,
      );
      setNominations((prev) => new Map(prev).set(data.id, data));
    },
    updateNomCom: async (nomcomId, comment) => {
      const data = await client.nomcoms.update(nomcomId, comment);
      setNominations((prev) => new Map(prev).set(data.id, data));
    },
    toggleWatched: async (movieId) => {
      if (!userId) return;
      const nomination = Array.from(nominations.values()).find(
        (candidate) => candidate.movieId === movieId,
      );
      const hasSeen = Boolean(
        nomination?.seenBy.some((user) => user.id === userId),
      );
      const { seenBy } = await (
        hasSeen ? client.seen.delete : client.seen.create
      )(movieId);
      setNominations((prev) => {
        const next = new Map(prev);
        for (const [id, candidate] of prev) {
          if (candidate.movieId === movieId)
            next.set(id, { ...candidate, seenBy });
        }
        return next;
      });
    },
    toggleCompleted: async (nominationId) => {
      const nomination = nominations.get(nominationId);
      const data = await client.nominations.setCompleted(
        nominationId,
        !nomination?.completed,
      );
      setNominations((prev) => new Map(prev).set(data.id, data));
    },
  };

  return (
    <Room
      userId={userId}
      viewState={viewState}
      viewContext={viewContext}
      setViewState={setViewState}
      api={api}
      nominees={all}
      isLoading={false}
    />
  );
}

const mapify = <T extends { id: number }>(arr: T[]): Map<number, T> =>
  new Map(arr.map((item) => [item.id, item]));
