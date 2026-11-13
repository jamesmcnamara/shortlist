// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useUrlViewState } from "./useUrlViewState";
import type { SortOption } from "./index";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("sort=custom&filters=mine"),
}));

afterEach(cleanup);

it("re-reads a URL sort when additional options arrive or disappear", () => {
  const custom: SortOption = {
    id: "custom",
    label: "Custom",
    compare: () => 0,
  };
  const noSorts: SortOption[] = [];
  const { result, rerender } = renderHook(
    ({ sorts }: { sorts: readonly SortOption[] }) => useUrlViewState(sorts),
    { initialProps: { sorts: noSorts } },
  );
  expect(result.current[0]).toEqual({ sort: "recent", filters: ["mine"] });

  rerender({ sorts: [custom] });
  expect(result.current[0]).toEqual({ sort: "custom", filters: ["mine"] });

  rerender({ sorts: [] });
  expect(result.current[0]).toEqual({ sort: "recent", filters: ["mine"] });
});
