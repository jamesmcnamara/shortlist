"use client";

import { useMemo } from "react";
import { Theatre } from "@/app/components/Theatre";
import { DataBoundary } from "@/app/lib/data/DataBoundary";
import { useDataSession } from "@/app/lib/data/DataProvider";
import { usePublicTheatre } from "@/app/lib/data/queries";
import { useUrlViewState } from "@/app/lib/view/useUrlViewState";

export function PublicTheatreContainer({ shareCode }: { shareCode: string }) {
  const { data, error, retry } = usePublicTheatre(shareCode);
  const { userId } = useDataSession();
  const viewContext = useMemo(() => ({ userId }), [userId]);
  const [viewState, setViewState] = useUrlViewState();

  return (
    <DataBoundary
      pending={!data}
      error={error}
      retry={retry}
      requiresUser={false}
    >
      {data && (
        <Theatre
          name={data.theatre.name}
          header={{}}
          userId={userId}
          viewState={viewState}
          viewContext={viewContext}
          setViewState={setViewState}
          nominees={data.nominations}
        />
      )}
    </DataBoundary>
  );
}
