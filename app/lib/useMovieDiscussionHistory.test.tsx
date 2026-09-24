// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMovieDiscussionHistory } from "./useMovieDiscussionHistory";

describe("useMovieDiscussionHistory", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("closes the discussion when the browser goes back", () => {
    const { result } = renderHook(() => useMovieDiscussionHistory());

    act(() => result.current.openDiscussion(12));
    const discussionState = window.history.state;
    expect(result.current.focusedId).toBe(12);

    act(() =>
      window.dispatchEvent(new PopStateEvent("popstate", { state: null })),
    );
    expect(result.current.focusedId).toBeNull();

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: discussionState }),
      ),
    );
    expect(result.current.focusedId).toBe(12);
  });

  it("uses browser back when the discussion is closed directly", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useMovieDiscussionHistory());

    act(() => result.current.openDiscussion(12));
    act(() => result.current.closeDiscussion());

    expect(back).toHaveBeenCalledOnce();
    back.mockRestore();
  });
});
