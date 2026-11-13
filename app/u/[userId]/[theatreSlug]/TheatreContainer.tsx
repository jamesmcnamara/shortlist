"use client";

import type { TheatreAPI } from "@/app/components/Theatre";
import { Theatre } from "@/app/components/Theatre";
import { useDataSession } from "@/app/lib/data/DataProvider";
import { useNominations } from "@/app/lib/data/queries";
import { votersOf } from "@/app/lib/extensions/movieclub/shared";
import { movieClubSorts } from "@/app/lib/extensions/movieclub/view";
import { useUrlViewState } from "@/app/lib/view/useUrlViewState";
import { useMemo } from "react";
import { find, some, set, mod, matching } from "shades";
import { useTheatre } from "./TheatreContext";
import type { Nomination } from "@/src/db/schema";

export function TheatreContainer() {
  const { theatre, isAdmin, role, client, noms, detail } = useTheatre();
  const { mutate } = useNominations(theatre.id);
  const { userId } = useDataSession();
  const viewContext = useMemo(() => ({ userId }), [userId]);
  const additionalSorts = movieClubSorts(theatre.description);
  const [viewState, setViewState] = useUrlViewState(additionalSorts);

  const api: TheatreAPI = {
    updateDescription: async (description) => {
      await client.update({ description });
    },
    importTitle: client.nominations.importTitle,
    suggest: client.suggestions.create,
    refreshJustWatch: async (movieId: number) => {
      await client.refreshJustWatch(movieId);
    },
    refreshBoxOffice: async (movieId: number) => {
      await client.refreshBoxOffice(movieId);
    },
    saveBudget: client.saveBudget,
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
      await client.nominations.setCompleted(
        id,
        nomination?.completedAt ? null : new Date(),
      );
    },
    vote: async (id, action) => {
      const member = find({ id: userId })(detail.members ?? []);
      if (!member) {
        throw new Error(
          "Your membership could not be loaded. Refresh and try again.",
        );
      }
      const { name, username } = member;
      const voter = { id: member.id, name, username };
      await mutate(
        async () => {
          await client.movieClub.vote(id, action);
          return noms;
        },
        {
          optimisticData: mod(matching({ id }))((nom: Nomination) => {
            const voters = votersOf(nom);
            const voteIndex = voters.findIndex(({ id }) => id === userId);
            const next =
              action === "unvote"
                ? voters.filter((_, index) => index !== voteIndex)
                : [...voters, voter].sort((a, b) =>
                    (a.username ?? a.name).localeCompare(b.username ?? b.name),
                  );
            return set("extensions", "movieclub", "voters")(next)(nom);
          })(noms),
          populateCache: false,
          rollbackOnError: true,
        },
      );
    },
  };

  return (
    <Theatre
      key={theatre.id}
      theatreId={theatre.id}
      name={theatre.name}
      description={theatre.description}
      header={{
        theatre: { id: theatre.id, path: theatre.path, isAdmin },
      }}
      isAdmin={isAdmin}
      isMember={Boolean(role)}
      userId={userId}
      viewState={viewState}
      viewContext={viewContext}
      additionalSorts={additionalSorts}
      setViewState={setViewState}
      api={api}
      nominees={noms}
    />
  );
}
