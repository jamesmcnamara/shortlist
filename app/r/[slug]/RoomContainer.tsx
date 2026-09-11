"use client";

import { useFirstRoomTour } from "@/app/components/onboarding/useFirstRoomTour";
import { getRoomType } from "@/app/lib/rooms";
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
  const { room, client, currentCycle } = useRoom();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nominations, setNominations] = useState(mapify(noms));

  const userId = session?.user?.id;

  useFirstRoomTour({
    roomType: getRoomType(room),
    isReady: true,
  });

  const all = useMemo(() => Array.from(nominations.values()), [nominations]);

  const viewContext = useMemo(
    () => ({ room, currentCycle, userId }),
    [room, currentCycle, userId],
  );

  const viewState = useMemo(
    () => parseViewState(new URLSearchParams(searchParams.toString()), room),
    [searchParams, room],
  );

  const setViewState = useCallback(
    (next: typeof viewState) => {
      const params = toSearchParams(next, room);
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [room, router],
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
    changeVote: async (nomination, action) => {
      const data = await (
        action === "add" ? client.votes.create : client.votes.delete
      )(nomination.id);
      setNominations((prev) => new Map(prev).set(data.id, data));
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
