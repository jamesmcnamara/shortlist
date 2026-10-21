"use client";

import type { TheatreAPI } from "@/app/components/Theatre";
import { Theatre } from "@/app/components/Theatre";
import { useDataSession } from "@/app/lib/data/DataProvider";
import { useUrlViewState } from "@/app/lib/view/useUrlViewState";
import { useMemo } from "react";
import { some } from "shades";
import { useTheatre } from "./TheatreContext";

export function TheatreContainer() {
  const { theatre, theatres, isAdmin, detail, client, noms } = useTheatre();
  const { userId } = useDataSession();
  const viewContext = useMemo(() => ({ userId }), [userId]);
  const [viewState, setViewState] = useUrlViewState();

  const api: TheatreAPI = {
    importTitle: client.nominations.importTitle,
    refreshJustWatch: async (movieId: number) => {
      await client.refreshJustWatch(movieId);
    },
    refreshBoxOffice: async (movieId: number) => {
      await client.refreshBoxOffice(movieId);
    },
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
      const hasSeen = some({ id: userId })(nomination?.seenBy ?? []);
      await (hasSeen ? client.seen.delete : client.seen.create)(movieId);
    },
    markWatched: async (movieIds) => {
      const unseen = movieIds.filter(
        (movieId) =>
          !noms
            .find((item) => item.movieId === movieId)
            ?.seenBy.some((user) => user.id === userId),
      );
      await Promise.all(unseen.map((movieId) => client.seen.create(movieId)));
    },
    toggleCompleted: async (id) => {
      const nomination = noms.find((item) => item.id === id);
      await client.nominations.setCompleted(id, !nomination?.completed);
    },
  };

  return (
    <Theatre
      key={theatre.id}
      theatreId={theatre.id}
      name={theatre.name}
      header={{
        theatre: { id: theatre.id, inviteCode: detail.inviteCode },
        showMyTheatres: theatres.length > 1,
      }}
      isAdmin={isAdmin}
      userId={userId}
      viewState={viewState}
      viewContext={viewContext}
      setViewState={setViewState}
      api={api}
      nominees={noms}
    />
  );
}
