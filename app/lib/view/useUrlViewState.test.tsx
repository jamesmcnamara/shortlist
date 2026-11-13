// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useUrlViewState } from "./useUrlViewState";
import type { SortOption } from "./index";

const navigation = vi.hoisted(() => ({
  query: "sort=custom&filters=mine",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

beforeEach(() => {
  navigation.query = "sort=custom&filters=mine";
  navigation.replace.mockReset();
});
afterEach(cleanup);

it("re-reads a saved default when theatre data arrives", () => {
  navigation.query = "";
  const { result, rerender } = renderHook(
    ({ defaultSort }: { defaultSort: string | null }) =>
      useUrlViewState([], defaultSort),
    { initialProps: { defaultSort: null as string | null } },
  );
  expect(result.current[0].sort).toBe("recent");
  rerender({ defaultSort: "title" });
  expect(result.current[0].sort).toBe("title");
  navigation.query = "sort=recent";
  rerender({ defaultSort: "title" });
  expect(result.current[0].sort).toBe("recent");
});

it("keeps an explicit recent sort in the URL when the saved default differs", () => {
  navigation.query = "";
  const { result } = renderHook(() => useUrlViewState([], "title"));
  act(() => result.current[1]({ sort: "recent", filters: ["mine"] }));
  expect(navigation.replace).toHaveBeenLastCalledWith(
    "?sort=recent&filters=mine",
    { scroll: false },
  );
  act(() => result.current[1]({ sort: "title", filters: [] }));
  expect(navigation.replace).toHaveBeenLastCalledWith("?", { scroll: false });
});

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
