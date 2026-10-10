"use client";

import type { RoomAPI } from "@/app/components/Room";
import type { RoomApi } from "../api";
import type { Nomination } from "@/src/db/schema";
import { useDataSession } from "./DataProvider";

export function useRoomActions(client: RoomApi, noms: Nomination[]): RoomAPI {
  const { userId } = useDataSession();
  return {
    importTitle: client.nominations.importTitle,
    refreshJustWatch: client.refreshJustWatch,
    nominate: async (candidate, comment) => {
      await client.nominations.create({ movieId: candidate.id, comment });
    },
    delete: async (id) => {
      await client.nominations.delete(id);
    },
    updateNomRec: async (id, comment) => {
      await client.nominations.updateComment(id, comment);
    },
    addNomCom: async (nominationId, comment) => {
      await client.nomcoms.create(nominationId, comment);
    },
    updateNomCom: async (nomcomId, comment) => {
      await client.nomcoms.update(nomcomId, comment);
    },
    toggleWatched: async (movieId) => {
      const nomination = noms.find((item) => item.movieId === movieId);
      const hasSeen = nomination?.seenBy.some((user) => user.id === userId);
      await (hasSeen ? client.seen.delete : client.seen.create)(movieId);
    },
    toggleCompleted: async (id) => {
      const nomination = noms.find((item) => item.id === id);
      await client.nominations.setCompleted(id, !nomination?.completed);
    },
  };
}
