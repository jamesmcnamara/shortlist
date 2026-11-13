"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  parseViewState,
  toSearchParams,
  type SortOption,
  type ViewState,
} from "./index";

/** Keeps the sort and filters in the URL so a view can be linked to. */
export function useUrlViewState(
  additionalSorts?: readonly SortOption[],
  defaultSort?: string | null,
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fallbackSort = parseViewState(
    new URLSearchParams(),
    additionalSorts,
    defaultSort,
  ).sort;
  const viewState = useMemo(
    () =>
      parseViewState(
        new URLSearchParams(searchParams.toString()),
        additionalSorts,
        fallbackSort,
      ),
    [searchParams, additionalSorts, fallbackSort],
  );
  const setViewState = useCallback(
    (next: ViewState) => {
      const query = toSearchParams(next, fallbackSort).toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router, fallbackSort],
  );
  return [viewState, setViewState] as const;
}
