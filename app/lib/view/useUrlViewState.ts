"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { parseViewState, toSearchParams, type ViewState } from "./index";

/** Keeps the sort and filters in the URL so a view can be linked to. */
export function useUrlViewState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewState = useMemo(
    () => parseViewState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const setViewState = useCallback(
    (next: ViewState) => {
      const query = toSearchParams(next).toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router],
  );
  return [viewState, setViewState] as const;
}
