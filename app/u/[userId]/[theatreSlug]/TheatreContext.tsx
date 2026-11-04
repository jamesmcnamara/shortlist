"use client";

import { createContext, useContext, useMemo } from "react";
import {
  api,
  type TheatreApi,
  type TheatreDetail,
  type TheatreSummary,
} from "@/app/lib/api";
import type { SafeTheatre } from "@/lib/auth/require-theatre";
import type { Nomination, TheatreRole } from "@/src/db/schema";
import {
  useNominations,
  useTheatreDetail,
  useTheatres,
} from "@/app/lib/data/queries";
import { DataBoundary } from "@/app/lib/data/DataBoundary";
import { isAccessError } from "@/app/lib/data/DataProvider";

interface TheatreContextValue {
  theatre: SafeTheatre;
  role: TheatreRole | null;
  theatres: TheatreSummary[];
  client: TheatreApi;
  isAdmin: boolean;
  detail: TheatreDetail;
  noms: Nomination[];
}

const TheatreContext = createContext<TheatreContextValue | null>(null);

interface TheatreProviderProps {
  theatreId: string;
  children: React.ReactNode;
}

export function TheatreProvider({ theatreId, children }: TheatreProviderProps) {
  const { data: detail, ...detailQuery } = useTheatreDetail(theatreId);
  const { data: theatres, ...theatresQuery } = useTheatres();
  const { data: noms, ...nomQuery } = useNominations(theatreId);
  const client = useMemo(() => api.theatre(theatreId), [theatreId]);
  const value = useMemo<TheatreContextValue | null>(() => {
    if (!detail || !theatres || !noms) return null;
    const role = detail.membership?.role ?? null;
    return {
      theatre: detail.theatre,
      role,
      theatres,
      client,
      isAdmin: role === "admin",
      detail,
      noms,
    };
  }, [detail, theatres, noms, client]);

  const queries = [detailQuery, theatresQuery, nomQuery];
  const errors = queries.map((query) => query.error);
  return (
    <DataBoundary
      pending={!value}
      error={errors.find(isAccessError) ?? errors.find(Boolean)}
      retry={() => Promise.all(queries.map((query) => query.retry()))}
      requiresUser={false}
    >
      <TheatreContext.Provider value={value}>
        {children}
      </TheatreContext.Provider>
    </DataBoundary>
  );
}

export function useTheatre(): TheatreContextValue {
  const value = useContext(TheatreContext);
  if (!value) {
    throw new Error("useTheatre must be used inside a TheatreProvider.");
  }
  return value;
}
